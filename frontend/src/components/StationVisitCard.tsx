import React, { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { buildMapLinks, copyText, parseOpenStatus } from '@/utils/stationVisit';

type Props = {
  name?: string | null;
  address?: string | null;
  contactPhone?: string | null;
  businessHours?: string | null;
};

/**
 * 到店信息：营业状态 + 导航 + 拨号（白话对客）
 */
const StationVisitCard: React.FC<Props> = ({
  name,
  address,
  contactPhone,
  businessHours,
}) => {
  const open = useMemo(() => parseOpenStatus(businessHours), [businessHours]);
  const [copied, setCopied] = useState(false);

  if (!address && !contactPhone && !businessHours) return null;

  const maps = address ? buildMapLinks(address, name) : null;

  const onCopy = async () => {
    if (!address) return;
    const ok = await copyText(address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const badgeClass =
    open.status === 'open'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : open.status === 'closed'
        ? 'bg-gray-100 text-gray-600 ring-gray-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200';

  return (
    <div className="border-b border-gray-100 bg-gradient-to-r from-orange-50/80 to-white px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">到店取件</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass}`}
            >
              {open.label}
            </span>
          </div>
          {address && (
            <p className="flex items-start gap-1.5 text-sm text-gray-700">
              <Icon name="box" size={14} className="mt-0.5 shrink-0 text-primary" />
              <span className="break-all">{address}</span>
            </p>
          )}
          {contactPhone && (
            <p className="flex items-center gap-1.5 text-sm text-gray-600">
              <Icon name="phone" size={14} className="shrink-0 text-gray-400" />
              <a href={`tel:${contactPhone}`} className="text-primary hover:underline">
                {contactPhone}
              </a>
              <span className="text-xs text-gray-400">点号码可拨打</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {maps && (
            <>
              <a
                href={maps.amap}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primaryHover"
              >
                <Icon name="externalLink" size={14} />
                高德导航
              </a>
              <a
                href={maps.tencent}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                腾讯地图
              </a>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {copied ? '已复制地址' : '复制地址'}
              </button>
            </>
          )}
          {contactPhone && (
            <a
              href={`tel:${contactPhone}`}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 sm:hidden"
            >
              <Icon name="phone" size={14} />
              打电话
            </a>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        没绑通知？到店后直接看货架取件码，或先在本页查件再预约时段。
      </p>
    </div>
  );
};

export default StationVisitCard;
