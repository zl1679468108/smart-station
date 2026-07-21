import React from 'react';
import Logo from '@/components/brand/Logo';
import { systemInfo, changelog, type ChangelogEntry } from '@/config/version';

// 版本说明 Tab：系统介绍 + 版本更新日志（PRD §4.12.6）
const VersionTab: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* 系统介绍卡片 */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primaryLight">
            <Logo size={32} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-gray-800">{systemInfo.name}</h2>
            <p className="text-xs text-gray-400">
              {systemInfo.nameEn} · v{systemInfo.currentVersion}
            </p>
          </div>
        </div>

        <p className="mb-4 text-sm text-gray-600">{systemInfo.description}</p>

        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-gray-400">核心模块</span>
            <span className="flex flex-wrap gap-1.5">
              {systemInfo.modules.map((m) => (
                <span
                  key={m}
                  className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                >
                  {m}
                </span>
              ))}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-gray-400">技术栈</span>
            <span className="text-gray-700">{systemInfo.techStack}</span>
          </div>
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-gray-400">目标平台</span>
            <span className="text-gray-700">{systemInfo.platforms}</span>
          </div>
        </div>
      </div>

      {/* 版本更新日志 */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-gray-700">版本更新日志</h3>
        <div className="space-y-3">
          {changelog.map((ver) => (
            <div key={ver.version} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="font-mono text-base font-bold text-primary">
                  v{ver.version}
                </span>
                <span className="text-xs text-gray-400">{ver.date}</span>
              </div>
              <div className="space-y-1.5">
                {ver.entries.map((entry, i) => (
                  <ChangelogItem key={i} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============ 更新条目 ============
const ChangelogItem: React.FC<{ entry: ChangelogEntry }> = ({ entry }) => {
  const tagConfig = {
    added: { label: '新增', className: 'bg-success/10 text-success' },
    optimized: { label: '优化', className: 'bg-info/10 text-info' },
    fixed: { label: '修复', className: 'bg-warning/10 text-warning' },
  };
  const tag = tagConfig[entry.type];

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs ${tag.className}`}>
        {tag.label}
      </span>
      <span className="text-gray-700">{entry.description}</span>
    </div>
  );
};

export default VersionTab;
