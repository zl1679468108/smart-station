export type PickupType = 'in_store' | 'door';
export type ShippingStatus = 'pending' | 'picked' | 'shipped' | 'cancelled';
export type AddressRole = 'sender' | 'receiver';
export type AddressTag = 'home' | 'company' | 'school' | 'other';

export interface CourierRef {
  id: string;
  name: string;
  code: string;
}

export interface ShippingItem {
  id: string;
  shippingNo: string;
  pickupType: PickupType;
  pickupTime: string | null;
  pickupAddress: string | null;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  itemType: string | null;
  weight: number;
  insuredAmount: number;
  freight: number;
  status: ShippingStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  courierCompanyId: string | null;
  courier: CourierRef | null;
}

export interface ShippingListResult {
  items: ShippingItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FreightBreakdown {
  firstWeightPrice: number;
  additionalPrice: number;
  firstWeightKg: number;
  additionalWeight: number;
  freightBeforeInsure: number;
  insureRate: number;
  insureFee: number;
  freight: number;
  effectiveMonth: string | null;
  usedDefaultRate: boolean;
}

export interface AddressItem {
  id: string;
  role: AddressRole;
  name: string;
  phone: string;
  address: string;
  tag: AddressTag | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddressListResult {
  items: AddressItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateShippingBody {
  courierCompanyId?: string;
  pickupType?: PickupType;
  pickupTime?: string;
  pickupAddress?: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  itemType?: string;
  weight: number;
  insuredAmount?: number;
  note?: string;
}
