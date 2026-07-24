import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
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
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

/**
 * 系统管理控制器
 * - 驿站信息：GET/PUT /api/admin/station
 * - 仓库 3D 布局：GET/PUT /api/admin/station/layout-config
 * - 员工：GET/POST /api/admin/staff，PUT/PATCH /api/admin/staff/:id
 * - 货架：GET/POST /api/admin/shelves，PUT /api/admin/shelves/:id，PUT /api/admin/shelves/:id/position
 * - 快递公司：GET/POST /api/admin/couriers，PUT /api/admin/couriers/:id
 *
 * 全部需 TokenAuthGuard + AdminGuard（仅管理员可操作）
 */
@Controller('admin')
@UseGuards(TokenAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ============ 驿站 ============

  @Get('station')
  async getStation(@StationId() stationId: string) {
    return this.adminService.getStation(stationId);
  }

  @Put('station')
  async updateStation(@StationId() stationId: string, @Body() dto: UpdateStationDto) {
    return this.adminService.updateStation(stationId, dto);
  }

  // ============ 仓库 3D 布局配置 ============

  @Get('station/layout-config')
  async getLayoutConfig(@StationId() stationId: string) {
    return this.adminService.getLayoutConfig(stationId);
  }

  @Put('station/layout-config')
  async updateLayoutConfig(
    @StationId() stationId: string,
    @Body() dto: UpdateLayoutConfigDto,
  ) {
    return this.adminService.updateLayoutConfig(stationId, dto);
  }

  // 仓库 3D 布局统一保存（货架位置 + 仓库尺寸 + 门口列表，单个请求一次性提交）
  @Put('station/layout')
  async saveStationLayout(
    @StationId() stationId: string,
    @Body() dto: SaveStationLayoutDto,
  ) {
    return this.adminService.saveStationLayout(stationId, dto);
  }

  // ============ 员工 ============

  @Get('staff')
  async listStaff(@StationId() stationId: string) {
    return this.adminService.listStaff(stationId);
  }

  @Post('staff')
  @HttpCode(200)
  async createStaff(@StationId() stationId: string, @Body() dto: CreateStaffDto) {
    return this.adminService.createStaff(stationId, dto);
  }

  @Put('staff/:id')
  async updateStaff(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @StationId() stationId: string,
  ) {
    return this.adminService.updateStaff(stationId, id, dto);
  }

  @Patch('staff/:id/status')
  async setStaffStatus(
    @Param('id') id: string,
    @Body('status') status: 'active' | 'disabled',
    @StationId() stationId: string,
  ) {
    return this.adminService.setStaffStatus(stationId, id, status);
  }

  @Patch('staff/:id/reset-password')
  @HttpCode(200)
  async resetStaffPassword(
    @Param('id') id: string,
    @Body() dto: ResetStaffPasswordDto,
    @StationId() stationId: string,
  ) {
    return this.adminService.resetStaffPassword(stationId, id, dto);
  }

  // ============ 货架 ============

  @Get('shelves')
  async listShelves(@StationId() stationId: string) {
    return this.adminService.listShelves(stationId);
  }

  @Post('shelves')
  @HttpCode(200)
  async createShelf(@StationId() stationId: string, @Body() dto: CreateShelfDto) {
    return this.adminService.createShelf(stationId, dto);
  }

  @Put('shelves/:id')
  async updateShelf(
    @Param('id') id: string,
    @Body() dto: UpdateShelfDto,
    @StationId() stationId: string,
  ) {
    return this.adminService.updateShelf(stationId, id, dto);
  }

  // 货架位置单独更新（拖拽高频调用专用）
  @Put('shelves/:id/position')
  async updateShelfPosition(
    @Param('id') id: string,
    @Body() dto: UpdateShelfPositionDto,
    @StationId() stationId: string,
  ) {
    return this.adminService.updateShelfPosition(stationId, id, dto);
  }

  // ============ 快递公司（全局） ============

  @Get('couriers')
  async listCouriers() {
    return this.adminService.listCouriers();
  }

  @Post('couriers')
  @HttpCode(200)
  async createCourier(@Body() dto: CreateCourierCompanyDto) {
    return this.adminService.createCourier(dto);
  }

  @Put('couriers/:id')
  async updateCourier(@Param('id') id: string, @Body() dto: UpdateCourierCompanyDto) {
    return this.adminService.updateCourier(id, dto);
  }

  // ============ 通知可观测 ============

  @Get('notify/bindings')
  async listNotifyBindings(
    @StationId() stationId: string,
    @Query('limit') limit?: string,
    @Query('phone') phone?: string,
  ) {
    return this.adminService.listNotifyBindings(stationId, {
      limit: limit ? Number(limit) : 50,
      phone,
    });
  }

  @Get('notify/logs')
  async listNotifyLogs(
    @StationId() stationId: string,
    @Query('limit') limit?: string,
    @Query('phone') phone?: string,
    @Query('status') status?: string,
    @Query('templateCode') templateCode?: string,
    @Query('todayOnly') todayOnly?: string,
    @Query('reach') reach?: string,
  ) {
    return this.adminService.listNotifyLogs(stationId, {
      limit: limit ? Number(limit) : 50,
      phone,
      status,
      templateCode,
      todayOnly: todayOnly === '1' || todayOnly === 'true',
      reach,
    });
  }

  /** 重新发送到件/滞留通知（失败补发或客户绑定后再推） */
  @Post('notify/logs/:id/resend')
  @HttpCode(200)
  async resendNotifyLog(@StationId() stationId: string, @Param('id') id: string) {
    return this.adminService.resendNotifyLog(stationId, id);
  }

  // 当前用户在当前驿站的员工关系（供前端判断权限）
  @Get('me')
  async me(@CurrentUser() user: UserPayload) {
    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role,
      staffId: user.staffId,
      currentStationId: user.currentStationId,
    };
  }
}
