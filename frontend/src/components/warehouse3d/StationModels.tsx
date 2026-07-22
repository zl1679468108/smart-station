import React from 'react';
import type { LayoutArea, LayoutAreaType } from '@/types/kiosk';
import { GltfModel, areaAssetKey } from './assets';

export interface StationModelPreset {
  type: LayoutAreaType;
  label: string;
  width: number;
  depth: number;
  height: number;
  color: string;
}

export const STATION_MODEL_PRESETS: StationModelPreset[] = [
  { type: 'counter', label: '服务台', width: 3.2, depth: 1.4, height: 1.4, color: '#0EA5E9' },
  { type: 'pickup', label: '待取件区', width: 3.6, depth: 2, height: 1.8, color: '#8B5CF6' },
  { type: 'outboundRecord', label: '出库记录区', width: 3, depth: 0.8, height: 2.2, color: '#14B8A6' },
  { type: 'exception', label: '异常件区', width: 2.2, depth: 1.4, height: 1.2, color: '#EF4444' },
  { type: 'oversize', label: '大件区', width: 2.6, depth: 1.8, height: 1.3, color: '#F97316' },
  { type: 'office', label: '办公区', width: 2.4, depth: 1.8, height: 1.8, color: '#3B82F6' },
];

const AREA_PALETTE: Record<LayoutAreaType, { color: string; surface: string; accent: string }> = {
  office: { color: '#3B82F6', surface: '#DBEAFE', accent: '#1D4ED8' },
  pickup: { color: '#8B5CF6', surface: '#EDE9FE', accent: '#6D28D9' },
  counter: { color: '#0EA5E9', surface: '#E0F2FE', accent: '#0369A1' },
  outboundRecord: { color: '#14B8A6', surface: '#CCFBF1', accent: '#0F766E' },
  exception: { color: '#EF4444', surface: '#FEE2E2', accent: '#B91C1C' },
  oversize: { color: '#F97316', surface: '#FFEDD5', accent: '#C2410C' },
};

export function getStationAreaPalette(type: LayoutAreaType) {
  return AREA_PALETTE[type] ?? AREA_PALETTE.pickup;
}

export function getStationModelPreset(type: string): StationModelPreset | undefined {
  return STATION_MODEL_PRESETS.find((m) => m.type === type);
}

export const ParcelBox: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: [number, number, number];
  color?: string;
  opacity?: number;
}> = ({
  position,
  rotation = [0, 0, 0],
  size = [0.46, 0.34, 0.38],
  color = '#C08457',
  opacity = 1,
}) => {
  const procedural = (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          roughness={0.82}
          metalness={0.04}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, size[1] / 2 + 0.004, 0]}>
        <boxGeometry args={[size[0] * 0.72, 0.012, size[2] * 0.1]} />
        <meshStandardMaterial color="#8B5E34" roughness={0.78} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0, size[2] / 2 + 0.002]}>
        <planeGeometry args={[size[0] * 0.42, size[1] * 0.28]} />
        <meshStandardMaterial color="#fff7ed" transparent opacity={0.35 * opacity} roughness={0.9} />
      </mesh>
    </group>
  );

  return (
    <group position={position} rotation={rotation}>
      {procedural}
    </group>
  );
};

const ParcelPile: React.FC<{ area: LayoutArea; dimmed?: boolean; dense?: boolean }> = ({
  area,
  dimmed,
  dense = false,
}) => {
  const opacity = dimmed ? 0.55 : 1;
  const boxes = dense
    ? [
        [-0.9, 0.2, -0.35, 0.1],
        [-0.35, 0.18, -0.28, -0.04],
        [0.18, 0.2, -0.32, 0.08],
        [0.72, 0.18, -0.22, -0.12],
        [-0.62, 0.52, 0.18, -0.08],
        [0.02, 0.5, 0.12, 0.12],
        [0.58, 0.48, 0.2, -0.06],
      ]
    : [
        [-0.36, 0.2, -0.16, 0.1],
        [0.24, 0.18, -0.1, -0.08],
        [0, 0.5, 0.22, 0.12],
      ];

  return (
    <group>
      {boxes.map(([x, y, z, r], i) => (
        <ParcelBox
          key={`pile-${i}`}
          position={[
            Math.max(-area.width * 0.38, Math.min(area.width * 0.38, x)),
            y,
            Math.max(-area.depth * 0.32, Math.min(area.depth * 0.32, z)),
          ]}
          rotation={[0, r, 0]}
          size={i % 3 === 0 ? [0.58, 0.34, 0.42] : [0.46, 0.3, 0.36]}
          color={i % 2 === 0 ? '#C58A54' : '#D8A15F'}
          opacity={opacity}
        />
      ))}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[area.width * 0.78, 0.04, area.depth * 0.68]} />
        <meshStandardMaterial color="#B45309" roughness={0.86} transparent opacity={0.18 * opacity} />
      </mesh>
    </group>
  );
};

const AreaBase: React.FC<{
  area: LayoutArea;
  color: string;
  selected?: boolean;
  dimmed?: boolean;
}> = ({ area, color, selected = false, dimmed = false }) => {
  const opacity = dimmed ? 0.12 : selected ? 0.26 : 0.18;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} receiveShadow>
        <planeGeometry args={[area.width, area.depth]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          emissive={color}
          emissiveIntensity={selected ? 0.18 : 0.08}
          roughness={0.8}
        />
      </mesh>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry
            args={[
              Math.min(Math.max(area.width, area.depth) * 0.42, 1.6),
              Math.min(Math.max(area.width, area.depth) * 0.48, 1.85),
              48,
            ]}
          />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.28}
            emissive={color}
            emissiveIntensity={0.18}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
};

const CounterModel: React.FC<{ area: LayoutArea; dimmed?: boolean }> = ({ area, dimmed }) => {
  const opacity = dimmed ? 0.38 : 1;
  const counterW = area.width * 0.82;
  return (
    <group>
      <mesh position={[0, 1.48, -area.depth * 0.48]} castShadow receiveShadow>
        <boxGeometry args={[counterW + 0.36, 1.3, 0.08]} />
        <meshStandardMaterial color="#E0F2FE" roughness={0.68} transparent opacity={0.86 * opacity} />
      </mesh>
      <mesh position={[0, 1.98, -area.depth * 0.535]} castShadow>
        <boxGeometry args={[counterW * 0.72, 0.28, 0.05]} />
        <meshStandardMaterial color="#0284C7" emissive="#0EA5E9" emissiveIntensity={0.18} transparent opacity={opacity} />
      </mesh>
      {[-0.46, 0, 0.46].map((x, i) => (
        <mesh key={`back-shelf-${i}`} position={[x * counterW, 1.36, -area.depth * 0.53]} castShadow>
          <boxGeometry args={[0.5, 0.08, 0.08]} />
          <meshStandardMaterial color="#38BDF8" roughness={0.58} transparent opacity={0.72 * opacity} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, -area.depth * 0.08]} castShadow receiveShadow>
        <boxGeometry args={[counterW, 0.82, Math.min(0.72, area.depth * 0.5)]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.58} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.86, -area.depth * 0.08]} castShadow>
        <boxGeometry args={[counterW + 0.16, 0.08, Math.min(0.82, area.depth * 0.55)]} />
        <meshStandardMaterial color="#64748B" roughness={0.46} metalness={0.08} transparent opacity={opacity} />
      </mesh>
      <mesh position={[-counterW * 0.28, 1.1, -area.depth * 0.1]} castShadow>
        <boxGeometry args={[0.52, 0.34, 0.05]} />
        <meshStandardMaterial color="#111827" roughness={0.5} transparent opacity={opacity} />
      </mesh>
      <mesh position={[-counterW * 0.28, 0.88, -area.depth * 0.1]} castShadow>
        <boxGeometry args={[0.12, 0.26, 0.08]} />
        <meshStandardMaterial color="#334155" roughness={0.56} transparent opacity={opacity} />
      </mesh>
      <mesh position={[counterW * 0.14, 0.96, 0.12]} castShadow>
        <boxGeometry args={[0.45, 0.22, 0.34]} />
        <meshStandardMaterial color="#E2E8F0" roughness={0.65} transparent opacity={opacity} />
      </mesh>
      <mesh position={[counterW * 0.35, 1.02, 0.18]} rotation={[0, 0, -0.45]} castShadow>
        <boxGeometry args={[0.08, 0.5, 0.08]} />
        <meshStandardMaterial color="#0F172A" roughness={0.48} transparent opacity={opacity} />
      </mesh>
      <ParcelBox
        position={[counterW * 0.36, 1.08, -0.14]}
        size={[0.38, 0.24, 0.28]}
        color="#D6A36A"
        opacity={opacity}
      />
      <mesh position={[-counterW * 0.44, 0.18, 0.42]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.36, 20]} />
        <meshStandardMaterial color="#0369A1" roughness={0.62} transparent opacity={opacity} />
      </mesh>
    </group>
  );
};

const PickupModel: React.FC<{ area: LayoutArea; dimmed?: boolean }> = ({ area, dimmed }) => {
  const opacity = dimmed ? 0.4 : 1;
  const cols = Math.max(2, Math.min(4, Math.floor(area.width / 0.75)));
  return (
    <group>
      <ParcelPile area={area} dimmed={dimmed} dense />
      {Array.from({ length: cols }).map((_, i) => {
        const x = (i - (cols - 1) / 2) * 0.72;
        return (
          <group key={`crate-${i}`} position={[x, 0, 0]}>
            <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.56, 0.5, 0.68]} />
              <meshStandardMaterial color="#A78BFA" roughness={0.72} transparent opacity={0.5 * opacity} />
            </mesh>
            <ParcelBox position={[0, 0.68, -0.08]} size={[0.42, 0.28, 0.34]} opacity={opacity} />
            <ParcelBox
              position={[0.1, 0.96, 0.08]}
              size={[0.36, 0.24, 0.3]}
              color="#D6A36A"
              opacity={opacity}
            />
          </group>
        );
      })}
    </group>
  );
};

const OutboundRecordModel: React.FC<{ area: LayoutArea; dimmed?: boolean }> = ({ area, dimmed }) => {
  const opacity = dimmed ? 0.42 : 1;
  const cols = Math.max(3, Math.min(6, Math.floor(area.width / 0.5)));
  const rows = 4;
  const cellW = Math.min(0.46, area.width / cols);
  return (
    <group position={[0, 0, -area.depth * 0.12]}>
      <mesh position={[0, area.height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[area.width * 0.9, area.height, Math.min(0.28, area.depth * 0.55)]} />
        <meshStandardMaterial color="#E2E8F0" roughness={0.62} metalness={0.08} transparent opacity={opacity} />
      </mesh>
      <mesh position={[-area.width * 0.28, area.height - 0.18, 0.17]} castShadow>
        <boxGeometry args={[area.width * 0.24, 0.18, 0.035]} />
        <meshStandardMaterial color="#0F766E" emissive="#14B8A6" emissiveIntensity={0.24} transparent opacity={opacity} />
      </mesh>
      {Array.from({ length: cols * rows }).map((_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * cellW;
        const y = 0.35 + row * ((area.height - 0.5) / rows);
        return (
          <mesh key={`outbound-record-${i}`} position={[x, y, 0.155]} castShadow>
            <boxGeometry args={[cellW * 0.86, 0.28, 0.025]} />
            <meshStandardMaterial color={i % 5 === 0 ? '#99F6E4' : i % 3 === 0 ? '#FFFFFF' : '#CBD5E1'} roughness={0.55} transparent opacity={opacity} />
          </mesh>
        );
      })}
    </group>
  );
};

const ExceptionModel: React.FC<{ area: LayoutArea; dimmed?: boolean }> = ({ area, dimmed }) => {
  const opacity = dimmed ? 0.42 : 1;
  return (
    <group>
      <ParcelPile area={area} dimmed={dimmed} />
      {[-0.38, 0.38].map((x, i) => (
        <group key={`bin-${i}`} position={[x, 0, 0]}>
          <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.58, 0.62, 0.58]} />
            <meshStandardMaterial color={i === 0 ? '#FCA5A5' : '#FDBA74'} roughness={0.72} transparent opacity={0.68 * opacity} />
          </mesh>
          <ParcelBox
            position={[0, 0.78, 0]}
            size={[0.42, 0.28, 0.34]}
            color={i === 0 ? '#F87171' : '#FB923C'}
            opacity={opacity}
          />
        </group>
      ))}
      <mesh position={[0, 1.15, -area.depth * 0.28]} castShadow>
        <boxGeometry args={[1.1, 0.42, 0.06]} />
        <meshStandardMaterial color="#991B1B" emissive="#EF4444" emissiveIntensity={0.22} transparent opacity={opacity} />
      </mesh>
    </group>
  );
};

const OversizeModel: React.FC<{ area: LayoutArea; dimmed?: boolean }> = ({ area, dimmed }) => {
  const opacity = dimmed ? 0.42 : 1;
  return (
    <group>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[area.width * 0.72, 0.16, area.depth * 0.62]} />
        <meshStandardMaterial color="#92400E" roughness={0.78} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.24, -area.depth * 0.36]} castShadow>
        <boxGeometry args={[area.width * 0.74, 0.14, 0.12]} />
        <meshStandardMaterial color="#F97316" roughness={0.68} transparent opacity={0.78 * opacity} />
      </mesh>
      <ParcelBox position={[-0.36, 0.43, 0]} size={[0.7, 0.54, 0.62]} color="#D08A4B" opacity={opacity} />
      <ParcelBox position={[0.36, 0.38, -0.08]} size={[0.62, 0.46, 0.54]} color="#B77945" opacity={opacity} />
      <ParcelBox position={[0, 0.93, 0.05]} size={[0.54, 0.42, 0.42]} color="#C08457" opacity={opacity} />
    </group>
  );
};

const OfficeModel: React.FC<{ area: LayoutArea; dimmed?: boolean }> = ({ area, dimmed }) => {
  const opacity = dimmed ? 0.42 : 1;
  return (
    <group>
      <mesh position={[0, 0.86, -area.depth * 0.42]} castShadow receiveShadow>
        <boxGeometry args={[area.width * 0.78, 1.1, 0.08]} />
        <meshStandardMaterial color="#DBEAFE" roughness={0.68} transparent opacity={0.78 * opacity} />
      </mesh>
      <mesh position={[0, 0.36, -0.12]} castShadow receiveShadow>
        <boxGeometry args={[area.width * 0.58, 0.08, area.depth * 0.42]} />
        <meshStandardMaterial color="#BFDBFE" roughness={0.62} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.7, -0.12]} castShadow>
        <boxGeometry args={[area.width * 0.54, 0.08, area.depth * 0.38]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.58} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.98, -0.18]} castShadow>
        <boxGeometry args={[0.42, 0.28, 0.05]} />
        <meshStandardMaterial color="#111827" roughness={0.5} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0.44, 0.28, 0.38]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.5, 20]} />
        <meshStandardMaterial color="#64748B" roughness={0.7} transparent opacity={opacity} />
      </mesh>
    </group>
  );
};

export const StationAreaModel: React.FC<{
  area: LayoutArea;
  selected?: boolean;
  dimmed?: boolean;
}> = ({ area, selected = false, dimmed = false }) => {
  const palette = getStationAreaPalette(area.type);
  const assetKey = areaAssetKey(area.type);
  const opacity = dimmed ? 0.55 : 1;
  const proceduralBody = (
    <>
      {area.type === 'counter' && <CounterModel area={area} dimmed={dimmed} />}
      {area.type === 'pickup' && <PickupModel area={area} dimmed={dimmed} />}
      {area.type === 'outboundRecord' && <OutboundRecordModel area={area} dimmed={dimmed} />}
      {area.type === 'exception' && <ExceptionModel area={area} dimmed={dimmed} />}
      {area.type === 'oversize' && <OversizeModel area={area} dimmed={dimmed} />}
      {area.type === 'office' && <OfficeModel area={area} dimmed={dimmed} />}
    </>
  );

  return (
    <group>
      <AreaBase area={area} color={palette.color} selected={selected} dimmed={dimmed} />
      {assetKey ? (
        <GltfModel
          assetKey={assetKey}
          size={[area.width, area.height || 1.6, area.depth]}
          opacity={opacity}
          fallback={proceduralBody}
        />
      ) : (
        proceduralBody
      )}
    </group>
  );
};
