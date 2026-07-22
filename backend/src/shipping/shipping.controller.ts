import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { CreateShippingDto } from './dto/create-shipping.dto';
import { ShippingQueryDto } from './dto/shipping-query.dto';
import { EstimateFreightDto } from './dto/estimate-freight.dto';
import { UpdateShippingStatusDto } from './dto/update-shipping-status.dto';
import {
  AddressQueryDto,
  CreateAddressDto,
  UpdateAddressDto,
} from './dto/address-book.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

@Controller('shipping')
@UseGuards(TokenAuthGuard)
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('list')
  async list(@StationId() stationId: string, @Query() q: ShippingQueryDto) {
    return this.shippingService.list(stationId, q);
  }

  @Post('estimate')
  async estimate(@StationId() stationId: string, @Body() dto: EstimateFreightDto) {
    return this.shippingService.estimate(stationId, dto);
  }

  @Roles('admin', 'clerk')
  @Post('create')
  async create(
    @StationId() stationId: string,
    @Body() dto: CreateShippingDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.shippingService.create(stationId, dto, user.id);
  }

  @Get(':id([0-9a-fA-F-]{36})')
  async detail(@StationId() stationId: string, @Param('id') id: string) {
    return this.shippingService.detail(stationId, id);
  }

  @Roles('admin', 'clerk')
  @Patch(':id([0-9a-fA-F-]{36})/status')
  async updateStatus(
    @StationId() stationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateShippingStatusDto,
  ) {
    return this.shippingService.updateStatus(stationId, id, dto);
  }
}

@Controller('address-book')
@UseGuards(TokenAuthGuard)
export class AddressBookController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get()
  async list(@StationId() stationId: string, @Query() q: AddressQueryDto) {
    return this.shippingService.listAddresses(stationId, q);
  }

  @Roles('admin', 'clerk')
  @Post()
  async create(
    @StationId() stationId: string,
    @Body() dto: CreateAddressDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.shippingService.createAddress(stationId, dto, user.id);
  }

  @Roles('admin', 'clerk')
  @Patch(':id([0-9a-fA-F-]{36})')
  async update(
    @StationId() stationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.shippingService.updateAddress(stationId, id, dto);
  }

  @Roles('admin', 'clerk')
  @Delete(':id([0-9a-fA-F-]{36})')
  async remove(@StationId() stationId: string, @Param('id') id: string) {
    return this.shippingService.deleteAddress(stationId, id);
  }
}
