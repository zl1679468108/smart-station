import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { SupabaseService } from '../supabase/supabase.service';
import { TokenService } from '../auth/token.service';
import { NotifyService } from '../notify/notify.service';
import { UpdateStationDto } from './dto/update-station.dto';
import { CreateStaffDto, UpdateStaffDto, ResetStaffPasswordDto } from './dto/staff.dto';
import {
  CreateCourierCompanyDto,
  CreateShelfDto,
  UpdateCourierCompanyDto,
  UpdateShelfDto,
  UpdateShelfPositionDto,
} from './dto/shelf-courier.dto';
import { UpdateLayoutConfigDto, SaveStationLayoutDto } from './dto/layout-config.dto';

/**
 * 系统管理服务
 * - 驿站信息（当前驿站，管理员可编辑）
 * - 员工管理（按当前驿站隔离，新增时复用或创建 ss_users + 建立 ss_staff 关系）
 * - 货架管理（按当前驿站隔离）
 * - 快递公司管理（全局配置，所有驿站共用）
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(NotifyService) private readonly notifyService: NotifyService,
  ) {}

  /** 生成 8 位随机密码（含字母+数字，剔除易混淆字符 O/0/I/1/l） */
  private generateRandomPassword(length = 8): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < length; i++) {
      pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    return pwd;
  }

  // ============ 驿站 ============

  async getStation(stationId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('*')
      .eq('id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询驿站失败: ${error.message}`);
    if (!data) throw new NotFoundException('驿站不存在');
    return data;
  }

  async updateStation(stationId: string, dto: UpdateStationDto) {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.address !== undefined) patch.address = dto.address;
    if (dto.contactPhone !== undefined) patch.contact_phone = dto.contactPhone;
    if (dto.businessHours !== undefined) patch.business_hours = dto.businessHours;
    if (dto.floorPlanUrl !== undefined) patch.floor_plan_url = dto.floorPlanUrl;
    if (dto.overdueWarnDays !== undefined) patch.overdue_warn_days = Number(dto.overdueWarnDays);
    if (dto.overdueRemindDays !== undefined) patch.overdue_remind_days = Number(dto.overdueRemindDays);
    if (dto.overdueReturnDays !== undefined) patch.overdue_return_days = Number(dto.overdueReturnDays);
    if (dto.smsEnabled !== undefined) patch.sms_enabled = Boolean(dto.smsEnabled);
    if (dto.notifyConfig !== undefined) {
      // 浅合并，避免覆盖未传字段
      const { data: prevRow } = await this.supabase
        .getClient()
        .from('ss_stations')
        .select('notify_config')
        .eq('id', stationId)
        .maybeSingle();
      const prev =
        prevRow?.notify_config && typeof prevRow.notify_config === 'object'
          ? (prevRow.notify_config as Record<string, unknown>)
          : {};
      patch.notify_config = { ...prev, ...dto.notifyConfig };
    }

    if (Object.keys(patch).length === 0) {
      return this.getStation(stationId);
    }
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .update(patch)
      .eq('id', stationId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`更新驿站失败: ${error.message}`);
    if (!data) throw new NotFoundException('驿站不存在');
    return data;
  }

  // ============ 员工 ============

  async listStaff(stationId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_staff')
      .select(
        'id, role, status, joined_at, user:ss_users!ss_staff_user_id_fkey(id, phone, email, username, avatar_url, status)',
      )
      .eq('station_id', stationId)
      .order('joined_at', { ascending: true });
    if (error) throw new Error(`查询员工失败: ${error.message}`);
    return (data || []).map((row: any) => {
      const user = Array.isArray(row.user) ? row.user[0] : row.user;
      return {
        id: row.id,
        role: row.role,
        status: row.status,
        joinedAt: row.joined_at,
        userId: user?.id ?? null,
        phone: user?.phone ?? '',
        email: user?.email ?? null,
        username: user?.username ?? '',
        avatarUrl: user?.avatar_url ?? null,
        userStatus: user?.status ?? null,
      };
    });
  }

  async createStaff(stationId: string, dto: CreateStaffDto) {
    // 1. 查是否已有该手机号的 user
    const { data: existing } = await this.supabase
      .getClient()
      .from('ss_users')
      .select('id, phone, username, status')
      .eq('phone', dto.phone)
      .maybeSingle();

    let userId: string;
    let initialPassword: string | null = null;

    if (existing) {
      userId = existing.id;
      // 校验是否已在该驿站
      const { data: existStaff } = await this.supabase
        .getClient()
        .from('ss_staff')
        .select('id')
        .eq('user_id', userId)
        .eq('station_id', stationId)
        .maybeSingle();
      if (existStaff) {
        throw new ConflictException('该手机号已是本驿站员工');
      }
    } else {
      // 新建用户：必须提供密码
      if (!dto.password) {
        throw new BadRequestException('新增用户必须提供初始密码');
      }
      const hash = await bcrypt.hash(dto.password, 10);
      const { data: newUser, error: createErr } = await this.supabase
        .getClient()
        .from('ss_users')
        .insert({
          phone: dto.phone,
          username: dto.username || dto.phone,
          password_hash: hash,
          status: 'active',
        })
        .select('id')
        .maybeSingle();
      if (createErr || !newUser) {
        throw new Error(`创建用户失败: ${createErr?.message}`);
      }
      userId = newUser.id;
      initialPassword = dto.password;
    }

    // 2. 建立 staff 关系
    const { data: staff, error: staffErr } = await this.supabase
      .getClient()
      .from('ss_staff')
      .insert({
        user_id: userId,
        station_id: stationId,
        role: dto.role,
        status: 'active',
      })
      .select('id, role, status, joined_at')
      .maybeSingle();
    if (staffErr) {
      // 唯一约束冲突
      if (staffErr.code === '23505') {
        throw new ConflictException('该用户已是本驿站员工');
      }
      throw new Error(`创建员工关系失败: ${staffErr.message}`);
    }

    // 3. 若提供了 username 且用户是新建/复用，更新用户名
    if (dto.username && existing) {
      await this.supabase
        .getClient()
        .from('ss_users')
        .update({ username: dto.username })
        .eq('id', userId);
    }

    // 重新查回完整信息
    const { data: userRow } = await this.supabase
      .getClient()
      .from('ss_users')
      .select('id, phone, email, username, avatar_url, status')
      .eq('id', userId)
      .maybeSingle();

    return {
      id: staff.id,
      role: staff.role,
      status: staff.status,
      joinedAt: staff.joined_at,
      userId,
      phone: userRow?.phone ?? dto.phone,
      email: userRow?.email ?? null,
      username: userRow?.username ?? dto.username ?? dto.phone,
      avatarUrl: userRow?.avatar_url ?? null,
      userStatus: userRow?.status ?? null,
      initialPassword, // 仅新建用户时返回，提示管理员转交
    };
  }

  async updateStaff(stationId: string, staffId: string, dto: UpdateStaffDto) {
    const { data: staff, error } = await this.supabase
      .getClient()
      .from('ss_staff')
      .select('id, user_id')
      .eq('id', staffId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error || !staff) throw new NotFoundException('员工不存在');

    if (dto.role) {
      const { error: rErr } = await this.supabase
        .getClient()
        .from('ss_staff')
        .update({ role: dto.role })
        .eq('id', staffId);
      if (rErr) throw new Error(`更新角色失败: ${rErr.message}`);
    }
    if (dto.username && staff.user_id) {
      const { error: uErr } = await this.supabase
        .getClient()
        .from('ss_users')
        .update({ username: dto.username })
        .eq('id', staff.user_id);
      if (uErr) throw new Error(`更新用户名失败: ${uErr.message}`);
    }
    return this.listStaff(stationId).then((list) => list.find((s) => s.id === staffId));
  }

  async setStaffStatus(stationId: string, staffId: string, status: 'active' | 'disabled') {
    const { data: staff, error } = await this.supabase
      .getClient()
      .from('ss_staff')
      .select('id')
      .eq('id', staffId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error || !staff) throw new NotFoundException('员工不存在');
    const { error: uErr } = await this.supabase
      .getClient()
      .from('ss_staff')
      .update({ status })
      .eq('id', staffId);
    if (uErr) throw new Error(`更新状态失败: ${uErr.message}`);
    return { id: staffId, status };
  }

  /**
   * 重置员工密码
   * - 不传 password 则生成 8 位随机密码
   * - 更新 ss_users.password_hash 后销毁该用户全部会话，强制重新登录
   * - 返回明文新密码（仅本次返回，由管理员转交）
   */
  async resetStaffPassword(
    stationId: string,
    staffId: string,
    dto: ResetStaffPasswordDto,
  ): Promise<{ id: string; newPassword: string }> {
    const { data: staff, error } = await this.supabase
      .getClient()
      .from('ss_staff')
      .select('id, user_id')
      .eq('id', staffId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error || !staff) throw new NotFoundException('员工不存在');
    if (!staff.user_id) throw new BadRequestException('员工未关联用户账号');

    const newPassword = dto.password || this.generateRandomPassword();
    const hash = await bcrypt.hash(newPassword, 10);

    const { error: updateErr } = await this.supabase
      .getClient()
      .from('ss_users')
      .update({ password_hash: hash })
      .eq('id', staff.user_id);
    if (updateErr) throw new Error(`重置密码失败: ${updateErr.message}`);

    // 销毁该用户全部会话，强制所有设备重新登录
    await this.tokenService.destroyAllSessionsOfUser(staff.user_id);

    return { id: staffId, newPassword };
  }

  // ============ 货架 ============

  async listShelves(stationId: string) {
    const client = this.supabase.getClient();
    // 并行：货架列表 + 在库/滞留包裹（占用货架位置），一次查询后端聚合，避免 N+1
    const [shelvesRes, parcelsRes] = await Promise.all([
      client
        .from('ss_shelves')
        .select('id, number, size_type, layers, capacity_per_layer, description, status, pos_x, pos_y, rotation, zone, created_at')
        .eq('station_id', stationId)
        .order('number', { ascending: true }),
      client
        .from('ss_parcels')
        .select('shelf_id')
        .eq('station_id', stationId)
        .in('status', ['in_stock', 'overdue']),
    ]);
    if (shelvesRes.error) throw new Error(`查询货架失败: ${shelvesRes.error.message}`);
    if (parcelsRes.error) throw new Error(`查询在库包裹失败: ${parcelsRes.error.message}`);

    // 聚合每个货架的在库包裹数
    const countMap = new Map<string, number>();
    for (const p of parcelsRes.data || []) {
      if (p.shelf_id) countMap.set(p.shelf_id, (countMap.get(p.shelf_id) || 0) + 1);
    }

    return (shelvesRes.data || []).map((s: any) => {
      const inStockCount = countMap.get(s.id) || 0;
      const totalCapacity = s.layers * s.capacity_per_layer;
      return { ...s, in_stock_count: inStockCount, remaining_capacity: totalCapacity - inStockCount };
    });
  }

  async createShelf(stationId: string, dto: CreateShelfDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_shelves')
      .insert({
        station_id: stationId,
        number: dto.number,
        size_type: dto.sizeType,
        layers: dto.layers ?? 4,
        capacity_per_layer: dto.capacityPerLayer ?? 50,
        description: dto.description ?? null,
        status: 'active',
        pos_x: dto.posX ?? null,
        pos_y: dto.posY ?? null,
        rotation: dto.rotation ?? 0,
        zone: dto.zone ?? null,
      })
      .select(
        'id, number, size_type, layers, capacity_per_layer, description, status, pos_x, pos_y, rotation, zone, created_at',
      )
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('货架号已存在');
      }
      throw new Error(`创建货架失败: ${error.message}`);
    }
    return data;
  }

  async updateShelf(stationId: string, shelfId: string, dto: UpdateShelfDto) {
    // 改货架号或大小类型前校验：有在库/滞留包裹时拒绝，避免取件码位置语义失真。
    if (dto.number !== undefined || dto.sizeType !== undefined) {
      const { data: sh } = await this.supabase
        .getClient()
        .from('ss_shelves')
        .select('id, number, size_type')
        .eq('id', shelfId)
        .eq('station_id', stationId)
        .maybeSingle();
      if (!sh) throw new NotFoundException('货架不存在');
      if (dto.number !== undefined && sh.number !== dto.number) {
        const { count } = await this.supabase
          .getClient()
          .from('ss_parcels')
          .select('id', { count: 'exact', head: true })
          .eq('shelf_id', shelfId)
          .eq('station_id', stationId)
          .in('status', ['in_stock', 'overdue']);
        if (count && count > 0) {
          throw new BadRequestException(
            `货架 ${sh.number} 号上还有 ${count} 件在库/滞留包裹，无法修改货架号，请先清空该货架或改派包裹后再调整`,
          );
        }
      }
      if (dto.sizeType !== undefined && sh.size_type !== dto.sizeType) {
        const { count } = await this.supabase
          .getClient()
          .from('ss_parcels')
          .select('id', { count: 'exact', head: true })
          .eq('shelf_id', shelfId)
          .eq('station_id', stationId)
          .eq('status', 'in_stock');
        if (count && count > 0) {
          throw new BadRequestException(
            `货架 ${sh.number} 号上还有 ${count} 件在库包裹，无法修改大小类型，请先清空该货架或改派包裹后再调整`,
          );
        }
      }
    }

    const patch: Record<string, unknown> = {};
    if (dto.number !== undefined) patch.number = dto.number;
    if (dto.sizeType !== undefined) patch.size_type = dto.sizeType;
    if (dto.layers !== undefined) patch.layers = dto.layers;
    if (dto.capacityPerLayer !== undefined) patch.capacity_per_layer = dto.capacityPerLayer;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.posX !== undefined) patch.pos_x = dto.posX;
    if (dto.posY !== undefined) patch.pos_y = dto.posY;
    if (dto.rotation !== undefined) patch.rotation = dto.rotation;
    if (dto.zone !== undefined) patch.zone = dto.zone;
    if (Object.keys(patch).length === 0) {
      return this.listShelves(stationId).then((l) => l.find((s) => s.id === shelfId));
    }
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_shelves')
      .update(patch)
      .eq('id', shelfId)
      .eq('station_id', stationId)
      .select(
        'id, number, size_type, layers, capacity_per_layer, description, status, pos_x, pos_y, rotation, zone, created_at',
      )
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('货架号已存在');
      }
      throw new Error(`更新货架失败: ${error.message}`);
    }
    if (!data) throw new NotFoundException('货架不存在');
    return data;
  }

  /**
   * 更新货架位置（拖拽高频调用专用）
   * 与通用 updateShelf 分离：跳过 sizeType 校验，字段传 null 表示清空（回到自动布局）
   */
  async updateShelfPosition(
    stationId: string,
    shelfId: string,
    dto: UpdateShelfPositionDto,
  ) {
    const patch: Record<string, unknown> = {};
    if (dto.posX !== undefined) patch.pos_x = dto.posX;
    if (dto.posY !== undefined) patch.pos_y = dto.posY;
    if (dto.rotation !== undefined) patch.rotation = dto.rotation;
    if (dto.zone !== undefined) patch.zone = dto.zone;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供要更新的位置字段');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('ss_shelves')
      .update(patch)
      .eq('id', shelfId)
      .eq('station_id', stationId)
      .select(
        'id, number, size_type, layers, capacity_per_layer, description, status, pos_x, pos_y, rotation, zone, created_at',
      )
      .maybeSingle();
    if (error) throw new Error(`更新货架位置失败: ${error.message}`);
    if (!data) throw new NotFoundException('货架不存在');
    return data;
  }

  // ============ 驿站户型配置（3D 布局） ============

  async getLayoutConfig(stationId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('id, name, layout_config')
      .eq('id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询户型配置失败: ${error.message}`);
    if (!data) throw new NotFoundException('驿站不存在');
    return {
      stationId: data.id,
      stationName: data.name,
      layoutConfig: data.layout_config || {},
    };
  }

  async updateLayoutConfig(stationId: string, dto: UpdateLayoutConfigDto) {
    const { data: existing, error: queryErr } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('layout_config')
      .eq('id', stationId)
      .maybeSingle();
    if (queryErr) throw new Error(`查询户型配置失败: ${queryErr.message}`);
    if (!existing) throw new NotFoundException('驿站不存在');

    // 合并：未传字段保留旧值
    const prev = (existing.layout_config as Record<string, unknown>) || {};
    const next: Record<string, unknown> = { ...prev };
    if (dto.bounds !== undefined) next.bounds = dto.bounds;
    if (dto.doors !== undefined) next.doors = dto.doors;
    if (dto.areas !== undefined) next.areas = dto.areas;
    if (dto.obstacles !== undefined) next.obstacles = dto.obstacles;

    // 业务校验：门口坐标必须落在 bounds 内（若同时提供了 bounds）
    // 注意：地面中心在原点 (0,0)，所以坐标范围是 [-w/2, w/2] × [-d/2, d/2]
    const bounds = next.bounds as { width: number; depth: number } | undefined;
    const doors = next.doors as Array<{ x: number; y: number; width: number }> | undefined;
    if (bounds && doors) {
      const halfW = bounds.width / 2;
      const halfD = bounds.depth / 2;
      for (const d of doors) {
        if (Math.abs(d.x) > halfW || Math.abs(d.y) > halfD) {
          throw new BadRequestException(
            `门口 (${d.x}, ${d.y}) 超出仓库范围 (${bounds.width} × ${bounds.depth})`,
          );
        }
      }
    }
    // 业务校验：区域坐标必须落在 bounds 内（若同时提供了 bounds）
    const areas = next.areas as
      | Array<{ x: number; y: number; width: number; depth: number; label: string }>
      | undefined;
    if (bounds && areas) {
      const halfW = bounds.width / 2;
      const halfD = bounds.depth / 2;
      for (const a of areas) {
        if (
          Math.abs(a.x) + a.width / 2 > halfW ||
          Math.abs(a.y) + a.depth / 2 > halfD
        ) {
          throw new BadRequestException(
            `区域 ${a.label} (${a.x}, ${a.y}) 超出仓库范围 (${bounds.width} × ${bounds.depth})`,
          );
        }
      }
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .update({ layout_config: next })
      .eq('id', stationId)
      .select('id, name, layout_config')
      .maybeSingle();
    if (error) throw new Error(`保存户型配置失败: ${error.message}`);
    if (!data) throw new NotFoundException('驿站不存在');
    return {
      stationId: data.id,
      stationName: data.name,
      layoutConfig: data.layout_config,
    };
  }

  /**
   * 仓库 3D 布局统一保存（单个请求一次性提交所有改动）
   * - 货架位置批量更新（只更新 dto.shelves 中提供的项，其余保持不变）
   * - 仓库尺寸 + 门口列表 + 区域列表合并写入 ss_stations.layout_config
   * - 业务校验：门口坐标必须落在 bounds 内（地面中心在原点，范围 [-w/2, w/2] × [-d/2, d/2]）
   * - 业务校验：区域坐标必须落在 bounds 内
   */
  async saveStationLayout(stationId: string, dto: SaveStationLayoutDto) {
    const client = this.supabase.getClient();

    // 1. 批量更新货架位置
    let shelvesUpdated = 0;
    if (dto.shelves && dto.shelves.length > 0) {
      for (const item of dto.shelves) {
        const patch: Record<string, unknown> = {};
        if (item.posX !== undefined) patch.pos_x = item.posX;
        if (item.posY !== undefined) patch.pos_y = item.posY;
        if (item.rotation !== undefined) patch.rotation = item.rotation;
        if (item.zone !== undefined) patch.zone = item.zone;
        if (Object.keys(patch).length === 0) continue;

        const { error } = await client
          .from('ss_shelves')
          .update(patch)
          .eq('id', item.id)
          .eq('station_id', stationId);
        if (error) throw new Error(`更新货架 ${item.id} 位置失败: ${error.message}`);
        shelvesUpdated += 1;
      }
    }

    // 2. 合并 bounds + doors + areas 写入 layout_config（未传字段保留旧值）
    const layoutNeedsUpdate =
      dto.bounds !== undefined || dto.doors !== undefined || dto.areas !== undefined;
    let layoutConfig: Record<string, unknown> | null = null;
    if (layoutNeedsUpdate) {
      const { data: existing, error: queryErr } = await client
        .from('ss_stations')
        .select('layout_config')
        .eq('id', stationId)
        .maybeSingle();
      if (queryErr) throw new Error(`查询户型配置失败: ${queryErr.message}`);
      if (!existing) throw new NotFoundException('驿站不存在');

      const prev = (existing.layout_config as Record<string, unknown>) || {};
      const next: Record<string, unknown> = { ...prev };
      if (dto.bounds !== undefined) next.bounds = dto.bounds;
      if (dto.doors !== undefined) next.doors = dto.doors;
      if (dto.areas !== undefined) next.areas = dto.areas;

      // 业务校验：门口坐标必须落在 bounds 内
      const bounds = next.bounds as { width: number; depth: number } | undefined;
      const doors = next.doors as Array<{ x: number; y: number; width: number }> | undefined;
      if (bounds && doors) {
        const halfW = bounds.width / 2;
        const halfD = bounds.depth / 2;
        for (const d of doors) {
          if (Math.abs(d.x) > halfW || Math.abs(d.y) > halfD) {
            throw new BadRequestException(
              `门口 (${d.x}, ${d.y}) 超出仓库范围 (${bounds.width} × ${bounds.depth})`,
            );
          }
        }
      }
      // 业务校验：区域坐标必须落在 bounds 内
      const areas = next.areas as
        | Array<{ x: number; y: number; width: number; depth: number; label: string }>
        | undefined;
      if (bounds && areas) {
        const halfW = bounds.width / 2;
        const halfD = bounds.depth / 2;
        for (const a of areas) {
          if (
            Math.abs(a.x) + a.width / 2 > halfW ||
            Math.abs(a.y) + a.depth / 2 > halfD
          ) {
            throw new BadRequestException(
              `区域 ${a.label} (${a.x}, ${a.y}) 超出仓库范围 (${bounds.width} × ${bounds.depth})`,
            );
          }
        }
      }

      const { data, error } = await client
        .from('ss_stations')
        .update({ layout_config: next })
        .eq('id', stationId)
        .select('id, name, layout_config')
        .maybeSingle();
      if (error) throw new Error(`保存户型配置失败: ${error.message}`);
      if (!data) throw new NotFoundException('驿站不存在');
      layoutConfig = data.layout_config as Record<string, unknown>;
    } else {
      // 没改 bounds/doors/areas，直接读现有配置返回
      const { data, error } = await client
        .from('ss_stations')
        .select('layout_config')
        .eq('id', stationId)
        .maybeSingle();
      if (error) throw new Error(`查询户型配置失败: ${error.message}`);
      if (!data) throw new NotFoundException('驿站不存在');
      layoutConfig = (data.layout_config as Record<string, unknown>) || {};
    }

    return {
      shelvesUpdated,
      layoutConfig,
    };
  }

  // ============ 快递公司（全局） ============

  async listCouriers() {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_courier_companies')
      .select('id, name, code, service_phone, tracking_prefixes, status, sort_order, created_at')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`查询快递公司失败: ${error.message}`);
    return data || [];
  }

  async createCourier(dto: CreateCourierCompanyDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_courier_companies')
      .insert({
        name: dto.name,
        code: dto.code,
        service_phone: dto.servicePhone ?? null,
        tracking_prefixes: dto.trackingPrefixes ?? [],
        sort_order: dto.sortOrder ?? 0,
        status: 'active',
      })
      .select('id, name, code, service_phone, tracking_prefixes, status, sort_order, created_at')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('快递公司代码已存在');
      }
      throw new Error(`创建快递公司失败: ${error.message}`);
    }
    return data;
  }

  async updateCourier(id: string, dto: UpdateCourierCompanyDto) {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.servicePhone !== undefined) patch.service_phone = dto.servicePhone;
    if (dto.trackingPrefixes !== undefined) patch.tracking_prefixes = dto.trackingPrefixes;
    if (dto.sortOrder !== undefined) patch.sort_order = dto.sortOrder;
    if (dto.status !== undefined) patch.status = dto.status;
    if (Object.keys(patch).length === 0) {
      const { data } = await this.supabase
        .getClient()
        .from('ss_courier_companies')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      return data;
    }
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_courier_companies')
      .update(patch)
      .eq('id', id)
      .select('id, name, code, service_phone, tracking_prefixes, status, sort_order, created_at')
      .maybeSingle();
    if (error) throw new Error(`更新快递公司失败: ${error.message}`);
    if (!data) throw new NotFoundException('快递公司不存在');
    return data;
  }

  /** 客户通知绑定列表（target 脱敏）；phone 支持完整号/尾号模糊 */
  async listNotifyBindings(stationId: string, opts?: { limit?: number; phone?: string }) {
    const take = Math.min(Math.max(Number(opts?.limit) || 50, 1), 200);
    const phone = this.normalizePhoneQuery(opts?.phone);

    let q = this.supabase
      .getClient()
      .from('ss_notify_bindings')
      .select('id, phone, channel, target, status, created_at, updated_at', { count: 'exact' })
      .eq('station_id', stationId)
      .order('updated_at', { ascending: false })
      .limit(take);

    if (phone) {
      if (/^1\d{10}$/.test(phone)) q = q.eq('phone', phone);
      else q = q.like('phone', `%${phone}%`);
    }

    const { data, error, count } = await q;
    if (error) {
      if (String(error.message || '').includes('ss_notify_bindings')) {
        return { items: [], total: 0, message: '绑定表未初始化' };
      }
      throw new Error(`查询通知绑定失败: ${error.message}`);
    }
    const items = (data || []).map((r: any) => ({
      id: r.id,
      phone: r.phone,
      phoneMasked: this.maskPhone(r.phone),
      channel: r.channel,
      channelLabel: this.channelLabel(r.channel),
      targetMasked: this.maskSecret(r.target),
      status: r.status,
      statusLabel: r.status === 'active' ? '有效' : r.status === 'disabled' ? '已停用' : r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return { items, total: count ?? items.length };
  }

  /** 通知发送日志；phone 支持完整号/尾号模糊 */
  async listNotifyLogs(
    stationId: string,
    opts?: {
      limit?: number;
      page?: number;
      phone?: string;
      status?: string;
      templateCode?: string;
      todayOnly?: boolean;
      /** 含今天共 N 天（1–14），优先于 todayOnly */
      days?: number;
      /** 客户触达：unbound / pushed / push_failed（按 params.channelResults 推断） */
      reach?: string;
    },
  ) {
    const reach = this.normalizeReach(opts?.reach);
    const page = Math.max(Number(opts?.page) || 1, 1);
    // reach 需内存过滤，适当放宽抓取量
    const baseLimit = Number(opts?.limit) || 50;
    const pageSize = Math.min(Math.max(baseLimit, 1), 100);
    // 触达筛选先抓更大窗口再分页；普通筛选走 DB range
    const fetchSize = reach ? Math.min(Math.max(pageSize * page, 200), 500) : pageSize;
    const phone = this.normalizePhoneQuery(opts?.phone);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = this.supabase
      .getClient()
      .from('ss_sms_logs')
      .select(
        'id, template_code, recipient_phone, recipient_name, content, status, error_message, params, parcel_id, sent_at, created_at',
        { count: 'exact' },
      )
      .eq('station_id', stationId)
      .order('created_at', { ascending: false });

    if (reach) {
      q = q.limit(fetchSize);
    } else {
      q = q.range(from, to);
    }

    if (phone) {
      if (/^1\d{10}$/.test(phone)) q = q.eq('recipient_phone', phone);
      else q = q.like('recipient_phone', `%${phone}%`);
    }
    if (opts?.status) {
      q = q.eq('status', opts.status);
    }
    if (opts?.templateCode) {
      q = q.eq('template_code', opts.templateCode);
    }
    const days =
      opts?.days != null && Number(opts.days) > 0
        ? Math.min(Math.max(Math.floor(Number(opts.days)), 1), 14)
        : 0;
    if (days > 0) {
      q = q.gte('created_at', this.beijingDayStartIso(days));
    } else if (opts?.todayOnly) {
      q = q.gte('created_at', this.beijingDayStartIso(1));
    }

    const { data, error, count } = await q;
    if (error) throw new Error(`查询通知日志失败: ${error.message}`);

    let items = (data || []).map((r: any) => {
      const params = (r.params && typeof r.params === 'object' ? r.params : {}) as Record<
        string,
        unknown
      >;
      const channelResults = Array.isArray(params.channelResults)
        ? (params.channelResults as Array<{ channel?: string; ok?: boolean; mode?: string; error?: string }>)
        : [];
      const channels = channelResults.map((c) => this.formatChannelResult(c));
      const templateCode = r.template_code as string;
      const canResend = templateCode === 'inbound_notice' || templateCode === 'overdue_remind';
      const customerReach = this.deriveCustomerReach(channelResults);
      return {
        id: r.id,
        templateCode,
        templateLabel: this.templateLabel(templateCode),
        phone: r.recipient_phone,
        phoneMasked: this.maskPhone(r.recipient_phone),
        recipientName: r.recipient_name,
        content: r.content,
        status: r.status,
        statusLabel:
          r.status === 'sent' ? '已发送' : r.status === 'failed' ? '失败' : r.status === 'pending' ? '待发送' : r.status,
        errorMessage: r.error_message,
        channels,
        channelSummary: channels.map((c) => c.label).join(' · '),
        customerReach,
        customerReachLabel: this.customerReachLabel(customerReach),
        canResend,
        parcelId: r.parcel_id || null,
        sentAt: r.sent_at,
        createdAt: r.created_at,
      };
    });

    if (reach) {
      const filtered = items.filter((it) => it.customerReach === reach);
      const total = filtered.length;
      const pageItems = filtered.slice(from, from + pageSize);
      return { items: pageItems, total, page, pageSize };
    }

    return { items, total: count ?? items.length, page, pageSize };
  }

  /**
   * 通知记录按手机号聚合（运营复盘）
   * - 抓取近期日志内存聚合，便于看「谁多次未私信/失败」
   */
  async listNotifyLogPhoneSummary(
    stationId: string,
    opts?: {
      limit?: number;
      phone?: string;
      status?: string;
      templateCode?: string;
      todayOnly?: boolean;
      /** 含今天共 N 天（1–14），优先于 todayOnly */
      days?: number;
      /** 仅保留当前仍未绑定的手机号（跟进清单） */
      excludeBound?: boolean;
      reach?: string;
    },
  ) {
    const reach = this.normalizeReach(opts?.reach);
    const days =
      opts?.days != null && Number(opts.days) > 0
        ? Math.min(Math.max(Math.floor(Number(opts.days)), 1), 14)
        : 0;
    // 多日扫描放宽抓取上限，便于班中跟进近几日未绑定
    const defaultTake = days > 1 ? Math.min(300 + days * 120, 1000) : 300;
    const take = Math.min(Math.max(Number(opts?.limit) || defaultTake, 50), 1200);
    const phone = this.normalizePhoneQuery(opts?.phone);

    let q = this.supabase
      .getClient()
      .from('ss_sms_logs')
      .select(
        'id, template_code, recipient_phone, recipient_name, status, params, created_at',
      )
      .eq('station_id', stationId)
      .order('created_at', { ascending: false })
      .limit(take);

    if (phone) {
      if (/^1\d{10}$/.test(phone)) q = q.eq('recipient_phone', phone);
      else q = q.like('recipient_phone', `%${phone}%`);
    }
    if (opts?.status) q = q.eq('status', opts.status);
    if (opts?.templateCode) q = q.eq('template_code', opts.templateCode);
    if (days > 0) {
      q = q.gte('created_at', this.beijingDayStartIso(days));
    } else if (opts?.todayOnly) {
      q = q.gte('created_at', this.beijingDayStartIso(1));
    }

    const { data, error } = await q;
    if (error) throw new Error(`查询通知聚合失败: ${error.message}`);

    type Agg = {
      phone: string;
      phoneMasked: string;
      recipientName: string | null;
      total: number;
      sent: number;
      failed: number;
      unbound: number;
      pushed: number;
      pushFailed: number;
      lastAt: string | null;
      lastTemplateCode: string;
      lastTemplateLabel: string;
      lastReach: 'unbound' | 'pushed' | 'push_failed';
      lastReachLabel: string;
      hasBinding: boolean;
      /** 可重发的到件/滞留日志 id（按时间近→远，最多 5 条） */
      resendLogIds: string[];
    };

    const map = new Map<string, Agg>();
    for (const r of data || []) {
      const rawPhone = String(r.recipient_phone || '').trim();
      if (!rawPhone) continue;
      const params =
        r.params && typeof r.params === 'object' ? (r.params as Record<string, unknown>) : {};
      const channelResults = Array.isArray(params.channelResults)
        ? (params.channelResults as Array<{ channel?: string; ok?: boolean }>)
        : [];
      const customerReach = this.deriveCustomerReach(channelResults);
      if (reach && customerReach !== reach) continue;

      let agg = map.get(rawPhone);
      if (!agg) {
        agg = {
          phone: rawPhone,
          phoneMasked: this.maskPhone(rawPhone),
          recipientName: (r.recipient_name as string) || null,
          total: 0,
          sent: 0,
          failed: 0,
          unbound: 0,
          pushed: 0,
          pushFailed: 0,
          lastAt: r.created_at || null,
          lastTemplateCode: r.template_code as string,
          lastTemplateLabel: this.templateLabel(r.template_code as string),
          lastReach: customerReach,
          lastReachLabel: this.customerReachLabel(customerReach),
          hasBinding: false,
          resendLogIds: [],
        };
        map.set(rawPhone, agg);
      }
      agg.total += 1;
      if (r.status === 'sent') agg.sent += 1;
      if (r.status === 'failed') agg.failed += 1;
      if (customerReach === 'unbound') agg.unbound += 1;
      else if (customerReach === 'pushed') agg.pushed += 1;
      else agg.pushFailed += 1;
      // rows already ordered desc; first seen is latest
      const templateCode = String(r.template_code || '');
      const canResend =
        templateCode === 'inbound_notice' || templateCode === 'overdue_remind';
      const needResend =
        customerReach === 'unbound' ||
        customerReach === 'push_failed' ||
        r.status === 'failed';
      if (canResend && needResend && agg.resendLogIds.length < 5) {
        const lid = String(r.id || '');
        if (lid && !agg.resendLogIds.includes(lid)) agg.resendLogIds.push(lid);
      }
    }

    const phones = Array.from(map.keys());
    if (phones.length > 0) {
      try {
        const { data: binds, error: bErr } = await this.supabase
          .getClient()
          .from('ss_notify_bindings')
          .select('phone')
          .eq('station_id', stationId)
          .eq('status', 'active')
          .in('phone', phones);
        if (!bErr && binds) {
          const boundSet = new Set(
            (binds as Array<{ phone?: string }>).map((b) => String(b.phone || '').trim()).filter(Boolean),
          );
          for (const p of phones) {
            const agg = map.get(p);
            if (agg) agg.hasBinding = boundSet.has(p);
          }
        }
      } catch {
        // 绑定表异常时不阻断跟进清单
      }
    }

    let items = Array.from(map.values());
    if (opts?.excludeBound) {
      items = items.filter((x) => !x.hasBinding);
    }
    items.sort((a, b) => {
      // 优先未私信/失败多、且仍未绑定的客户
      const score = (x: Agg) =>
        x.unbound * 3 + x.pushFailed * 2 + x.failed + (x.hasBinding ? 0 : 1);
      const d = score(b) - score(a);
      if (d !== 0) return d;
      return String(b.lastAt || '').localeCompare(String(a.lastAt || ''));
    });

    return {
      items,
      total: items.length,
      scanned: (data || []).length,
      days: days || (opts?.todayOnly ? 1 : null),
      excludeBound: !!opts?.excludeBound,
    };
  }

  /**
   * 重新发送通知（到件/滞留）。
   * 适用：发送失败补发，或客户后来绑定了微信需要再推一次取件码。
   * 验证码类不支持重发（时效短且有独立限流）。
   */
  async resendNotifyLog(stationId: string, logId: string) {
    if (!logId) throw new BadRequestException('缺少通知记录 ID');

    const { data: log, error } = await this.supabase
      .getClient()
      .from('ss_sms_logs')
      .select(
        'id, template_code, recipient_phone, recipient_name, content, params, parcel_id, station_id, status',
      )
      .eq('id', logId)
      .maybeSingle();
    if (error) throw new Error(`查询通知记录失败: ${error.message}`);
    if (!log || log.station_id !== stationId) {
      throw new NotFoundException('通知记录不存在');
    }

    const templateCode = String(log.template_code || '');
    if (templateCode !== 'inbound_notice' && templateCode !== 'overdue_remind') {
      throw new BadRequestException('该类型通知不支持重发（仅支持到件通知、滞留提醒）');
    }

    const phone = String(log.recipient_phone || '').trim();
    if (!/^1\d{10}$/.test(phone)) {
      throw new BadRequestException('通知记录手机号无效，无法重发');
    }

    const station = await this.getStation(stationId);
    const stationName = station?.name || '智能快递驿站';
    const params =
      log.params && typeof log.params === 'object' ? (log.params as Record<string, unknown>) : {};

    let pickupCode =
      typeof params.pickupCode === 'string' && params.pickupCode
        ? String(params.pickupCode)
        : '';
    let days =
      typeof params.days === 'number'
        ? Number(params.days)
        : Number(params.days) || 0;

    // 缺参时从包裹补全
    if (log.parcel_id && (!pickupCode || (templateCode === 'overdue_remind' && !days))) {
      const { data: parcel } = await this.supabase
        .getClient()
        .from('ss_parcels')
        .select('id, pickup_code, inbound_at, station_id')
        .eq('id', log.parcel_id)
        .maybeSingle();
      if (parcel && parcel.station_id === stationId) {
        if (!pickupCode && parcel.pickup_code) pickupCode = String(parcel.pickup_code);
        if (templateCode === 'overdue_remind' && !days && parcel.inbound_at) {
          const inboundMs = new Date(parcel.inbound_at).getTime();
          if (!Number.isNaN(inboundMs)) {
            days = Math.max(0, Math.floor((Date.now() - inboundMs) / 86400000));
          }
        }
      }
    }

    if (templateCode === 'inbound_notice' && !pickupCode) {
      throw new BadRequestException('无法重发：缺少取件码（原始记录参数不完整）');
    }

    let dispatch;
    if (templateCode === 'inbound_notice') {
      dispatch = await this.notifyService.sendInboundNotice({
        stationName,
        phone,
        recipientName: log.recipient_name,
        pickupCode,
        parcelId: log.parcel_id || undefined,
        stationId,
      });
    } else {
      if (!days || days < 1) days = 7;
      dispatch = await this.notifyService.sendOverdueRemind({
        stationName,
        phone,
        recipientName: log.recipient_name,
        days,
        pickupCode: pickupCode || undefined,
        parcelId: log.parcel_id || undefined,
        stationId,
      });
    }

    return {
      logId,
      templateCode,
      templateLabel: this.templateLabel(templateCode),
      phoneMasked: this.maskPhone(phone),
      attempted: dispatch.attempted,
      customerBound: dispatch.customerBound,
      customerPushed: dispatch.customerPushed,
      customerChannels: dispatch.customerChannels,
      staffMessage: dispatch.staffMessage,
      channelResults: (dispatch.channelResults || []).map((c) => this.formatChannelResult(c)),
    };
  }

  /**
   * 批量重发到件/滞留通知。
   * 前端本页/按手机号一键补发走此接口，避免串行多次 HTTP。
   */
  async resendNotifyLogsBatch(stationId: string, ids: string[]) {
    const unique = Array.from(
      new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)),
    );
    if (unique.length === 0) {
      throw new BadRequestException('请选择要补发的通知记录');
    }
    if (unique.length > 40) {
      throw new BadRequestException('一次最多补发 40 条');
    }

    const results: Array<{
      logId: string;
      ok: boolean;
      customerBound?: boolean;
      customerPushed?: boolean;
      phoneMasked?: string;
      staffMessage: string;
    }> = [];

    let pushed = 0;
    let failed = 0;

    for (const id of unique) {
      try {
        const r = await this.resendNotifyLog(stationId, id);
        results.push({
          logId: id,
          ok: true,
          customerBound: r.customerBound,
          customerPushed: r.customerPushed,
          phoneMasked: r.phoneMasked,
          staffMessage: r.staffMessage,
        });
        if (r.customerPushed) pushed += 1;
        else failed += 1;
      } catch (e: any) {
        failed += 1;
        results.push({
          logId: id,
          ok: false,
          staffMessage: e?.message || '重发失败',
        });
      }
    }

    return {
      total: unique.length,
      pushed,
      failed,
      staffMessage: `一键补发完成：成功私信 ${pushed} 条，仍未私信/失败 ${failed} 条（共 ${unique.length} 条）`,
      results,
    };
  }

  /** 北京时间「含今天共 days 天」的起点 ISO（days=1 即今日 00:00） */
  private beijingDayStartIso(days: number): string {
    const safeDays = Math.min(Math.max(Math.floor(days) || 1, 1), 14);
    const now = new Date(Date.now() + 8 * 3600 * 1000 - (safeDays - 1) * 86400000);
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return new Date(`${y}-${m}-${d}T00:00:00+08:00`).toISOString();
  }

  private normalizePhoneQuery(raw?: string | null): string {
    return String(raw || '').replace(/\D/g, '').slice(0, 11);
  }

  private maskPhone(phone: string): string {
    const p = (phone || '').trim();
    if (p.length >= 7) return `${p.slice(0, 3)}****${p.slice(-4)}`;
    if (p.length >= 4) return `****${p.slice(-4)}`;
    return '****';
  }

  private maskSecret(raw: string): string {
    const s = String(raw || '');
    if (s.length <= 8) return '****';
    return `${s.slice(0, 4)}****${s.slice(-4)}`;
  }

  /** 绑定通道中文名 */
  private channelLabel(channel: string): string {
    const map: Record<string, string> = {
      wxpusher: '微信扫一扫',
      pushplus: '其他方式',
      serverchan: '旧版绑定',
      console: '开发日志',
      wecom: '驿站通知群',
    };
    return map[channel] || channel;
  }

  private templateLabel(code: string): string {
    const map: Record<string, string> = {
      inbound_notice: '到件通知',
      overdue_remind: '滞留提醒',
      kiosk_code: '查件验证码',
      bind_test: '绑定测试',
      appointment_created: '预约到店',
      appointment_confirmed: '预约确认',
    };
    return map[code] || code;
  }

  private modeLabel(mode?: string): string {
    const map: Record<string, string> = {
      full: '完整内容',
      public: '脱敏公告',
      admin_full: '管理员完整',
      customer_full: '客户私信',
      skipped_private: '已跳过（隐私）',
    };
    return mode ? map[mode] || mode : '';
  }


  /** 与 stats.getNotifyReach 一致：按 binding:* 通道推断客户触达 */
  private deriveCustomerReach(
    channelResults: Array<{ channel?: string; ok?: boolean }>,
  ): 'unbound' | 'pushed' | 'push_failed' {
    const customerResults = (channelResults || []).filter((c) =>
      String(c.channel || '').startsWith('binding:'),
    );
    if (customerResults.length === 0) return 'unbound';
    if (customerResults.some((c) => c.ok)) return 'pushed';
    return 'push_failed';
  }

  private customerReachLabel(reach: 'unbound' | 'pushed' | 'push_failed'): string {
    if (reach === 'pushed') return '已私信';
    if (reach === 'push_failed') return '私信失败';
    return '未私信';
  }

  private normalizeReach(raw?: string): 'unbound' | 'pushed' | 'push_failed' | undefined {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'unbound' || v === 'pushed' || v === 'push_failed') return v;
    return undefined;
  }

  /** 将 channelResults 单项映射为中文展示 */
  private formatChannelResult(c: {
    channel?: string;
    ok?: boolean;
    mode?: string;
    error?: string;
    attempts?: number;
    retried?: boolean;
  }): { key: string; ok: boolean; label: string } {
    const raw = String(c.channel || '');
    let name = raw;
    if (raw.startsWith('binding:wxpusher')) name = '客户微信（扫码）';
    else if (raw.startsWith('binding:pushplus')) name = '客户微信（其他）';
    else if (raw.startsWith('binding:serverchan')) name = '客户微信（旧版）';
    else if (raw === 'bindings_lookup') name = '客户绑定查询';
    else name = this.channelLabel(raw);

    const ok = Boolean(c.ok);
    const mode = this.modeLabel(c.mode);
    const attempts = Number(c.attempts || 0);
    const retried = Boolean(c.retried) || attempts > 1;
    let status = ok ? '成功' : '失败';
    if (retried && ok) status = '重试后成功';
    else if (retried && !ok) status = '重试后仍失败';
    const bits = [status];
    if (mode) bits.push(mode);
    if (attempts > 1) bits.push(`试了${attempts}次`);
    const label = `${name}：${bits.join(' · ')}`;
    return { key: raw || name, ok, label };
  }

}
