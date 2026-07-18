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
    // 改大小类型前校验：货架上有在库包裹则拒绝（避免包裹 size 与货架类型不一致）
    if (dto.sizeType !== undefined) {
      const { data: sh } = await this.supabase
        .getClient()
        .from('ss_shelves')
        .select('id, size_type, number')
        .eq('id', shelfId)
        .eq('station_id', stationId)
        .maybeSingle();
      if (!sh) throw new NotFoundException('货架不存在');
      if (sh.size_type !== dto.sizeType) {
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
    if (error) throw new Error(`更新货架失败: ${error.message}`);
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
}
