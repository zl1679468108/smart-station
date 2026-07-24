import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { UpdateCollectDto } from './dto/update-collect.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

/**
 * 库存查询控制器
 * - GET /api/inventory          分页列表 + 筛选（全员可读，含 viewer）
 * - GET /api/inventory/shelves  货架只读列表（全员可读，供入库/库存页面使用）
 * - GET /api/inventory/station  驿站信息只读（全员可读，供系统管理页面查看）
 * - GET /api/inventory/couriers 快递公司只读列表（全员可读，供入库/库存/系统管理使用）
 * - GET /api/inventory/:id      详情 + 状态轨迹（全员可读，含 viewer）
 * - POST /api/inventory/batch-exception  批量标记异常（admin + clerk）
 *
 * 角色权限（PRD 4.12.2）：查询员仅库存查询只读，标记异常需 admin+clerk
 * 注意：管理类写操作（增删改驿站/货架/快递公司）在 /api/admin/* 下，仅管理员可操作
 */
@Controller('inventory')
@UseGuards(TokenAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async list(@StationId() stationId: string, @Query() q: InventoryQueryDto) {
    return this.inventoryService.list(stationId, q);
  }

  // 以下静态路径必须放在 :id 之前，避免被当作 id 参数匹配

  @Get('shelves')
  async listShelves(@StationId() stationId: string) {
    return this.inventoryService.listShelves(stationId);
  }

  @Get('station')
  async getStation(@StationId() stationId: string) {
    return this.inventoryService.getStation(stationId);
  }

  @Get('couriers')
  async listCouriers() {
    return this.inventoryService.listCouriers();
  }

  // UUID 格式约束：避免 "shelves" 等静态路径被当作 id 匹配
  @Get(':id([0-9a-fA-F-]{36})')
  async detail(@StationId() stationId: string, @Param('id') id: string) {
    return this.inventoryService.detail(stationId, id);
  }

  /** 在库改价：调整到付/代收货款 */
  @Roles('admin', 'clerk')
  @Patch(':id([0-9a-fA-F-]{36})/collect')
  async updateCollect(
    @Param('id') id: string,
    @Body() dto: UpdateCollectDto,
    @CurrentUser() user: UserPayload,
    @StationId() stationId: string,
  ) {
    return this.inventoryService.updateCollect(stationId, id, dto, user.id);
  }

  @Roles('admin', 'clerk')
  @Post('batch-exception')
  async batchException(
    @Body('ids') ids: string[],
    @Body('reason') reason: string,
    @CurrentUser() user: UserPayload,
    @StationId() stationId: string,
  ) {
    return this.inventoryService.markException(stationId, ids || [], reason || '', user.id);
  }
}
