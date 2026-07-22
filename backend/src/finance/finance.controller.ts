import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { FinanceService } from './finance.service';
import { BillsQueryDto } from './dto/bills-query.dto';
import { GenerateBillsDto } from './dto/generate-bills.dto';
import { ReconcileBillDto } from './dto/reconcile-bill.dto';
import { UpsertRateDto } from './dto/upsert-rate.dto';
import { RatesQueryDto } from './dto/rates-query.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StationId } from '../common/decorators/station-id.decorator';

@Controller('finance')
@UseGuards(TokenAuthGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ===== 费率配置 =====

  @Get('rates')
  async listRates(@StationId() stationId: string, @Query() q: RatesQueryDto) {
    return this.financeService.listRates(stationId, q);
  }

  @Roles('admin')
  @Put('rates')
  async upsertRate(@StationId() stationId: string, @Body() dto: UpsertRateDto) {
    return this.financeService.upsertRate(stationId, dto);
  }

  // ===== 月结账单 =====

  @Get('bills')
  async listBills(@StationId() stationId: string, @Query() q: BillsQueryDto) {
    return this.financeService.listBills(stationId, q);
  }

  @Get('bills/export')
  async exportBills(
    @StationId() stationId: string,
    @Query() q: BillsQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.financeService.exportCsv(stationId, q);
    const filename = `finance-bills-${q.month || 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('bills/:id([0-9a-fA-F-]{36})')
  async getBill(@StationId() stationId: string, @Param('id') id: string) {
    return this.financeService.getBill(stationId, id);
  }

  @Get('bills/:id([0-9a-fA-F-]{36})/items')
  async billItems(@StationId() stationId: string, @Param('id') id: string) {
    return this.financeService.listBillItems(stationId, id);
  }

  @Roles('admin')
  @Post('bills/generate')
  async generate(@StationId() stationId: string, @Body() dto: GenerateBillsDto) {
    return this.financeService.generateBills(stationId, dto.month);
  }

  @Roles('admin')
  @Post('bills/:id([0-9a-fA-F-]{36})/reconcile')
  async reconcile(
    @StationId() stationId: string,
    @Param('id') id: string,
    @Body() dto: ReconcileBillDto,
  ) {
    return this.financeService.reconcile(stationId, id, dto);
  }
}
