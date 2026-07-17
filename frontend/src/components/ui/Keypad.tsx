import React, { useState, useCallback } from 'react';

/**
 * 虚拟键盘面板组件（PRD §4.14.3）
 * ---------------
 * 支持数字键盘（3×4）与字母键盘（QWERTY）两种模式。
 * 按键最小 48×48px，触摸友好；按下主色反馈。
 * 输入写入外部传入的 value，通过 onChange 回传。
 *
 * 用法：
 * <Keypad
 *   mode="numeric"           // 'numeric' | 'alpha'
 *   allowModeSwitch={false}  // 是否显示模式切换按钮
 *   onInput={(char) => {...}}  // 按下字符
 *   onBackspace={() => {...}}  // 退格
 *   onClear={() => {...}}      // 清空
 * />
 */

export type KeypadMode = 'numeric' | 'alpha';

interface KeypadProps {
  mode?: KeypadMode;
  allowModeSwitch?: boolean;
  enableDash?: boolean;
  onInput: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

const Keypad: React.FC<KeypadProps> = ({
  mode: initialMode = 'numeric',
  allowModeSwitch = false,
  enableDash = false,
  onInput,
  onBackspace,
  onClear,
}) => {
  const [mode, setMode] = useState<KeypadMode>(initialMode);

  const handleKey = useCallback(
    (char: string) => {
      onInput(char);
    },
    [onInput],
  );

  // 数字键盘：3×4 布局
  const numericKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  // 字母键盘：QWERTY 布局（大写）
  const alphaRows = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ];

  return (
    <div className="select-none">
      {/* 模式切换按钮 */}
      {allowModeSwitch && (
        <div className="mb-2 flex justify-end">
          <button
            onClick={() => setMode(mode === 'numeric' ? 'alpha' : 'numeric')}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200"
          >
            {mode === 'numeric' ? 'ABC 字母' : '123 数字'}
          </button>
        </div>
      )}

      {mode === 'numeric' ? (
        // 数字键盘
        <div className="grid grid-cols-3 gap-2">
          {numericKeys.map((k) => (
            <KeypadButton key={k} onClick={() => handleKey(k)}>
              {k}
            </KeypadButton>
          ))}
          {enableDash ? (
            <KeypadButton onClick={() => handleKey('-')} variant="action">
              -
            </KeypadButton>
          ) : (
            <KeypadButton onClick={onClear} variant="action">
              清空
            </KeypadButton>
          )}
          <KeypadButton onClick={() => handleKey('0')}>0</KeypadButton>
          <KeypadButton onClick={onBackspace} variant="action">
            ⌫
          </KeypadButton>
        </div>
      ) : (
        // 字母键盘
        <div className="space-y-2">
          {alphaRows.map((row, i) => (
            <div key={i} className="flex justify-center gap-1.5">
              {row.map((k) => (
                <KeypadButton key={k} onClick={() => handleKey(k)} size="sm">
                  {k}
                </KeypadButton>
              ))}
              {/* 第三行末尾加退格 */}
              {i === 2 && (
                <KeypadButton onClick={onBackspace} variant="action" size="sm">
                  ⌫
                </KeypadButton>
              )}
            </div>
          ))}
          {/* 底部：切换数字 + 清空 */}
          <div className="flex justify-center gap-2 pt-1">
            {allowModeSwitch && (
              <KeypadButton onClick={() => setMode('numeric')} variant="action" size="sm">
                123
              </KeypadButton>
            )}
            <KeypadButton onClick={onClear} variant="action" size="sm">
              清空
            </KeypadButton>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ 按键按钮 ============

interface KeypadButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'action';
  size?: 'md' | 'sm';
}

const KeypadButton: React.FC<KeypadButtonProps> = ({
  onClick,
  children,
  variant = 'default',
  size = 'md',
}) => {
  const base =
    'flex items-center justify-center rounded-lg font-medium transition-colors active:bg-primaryLight active:text-primary';
  const sizeClass = size === 'md' ? 'h-14 text-xl' : 'h-12 text-base';
  const variantClass =
    variant === 'action'
      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      : 'bg-white text-gray-800 border border-gray-200 hover:border-primary hover:text-primary';

  return (
    <button
      onClick={onClick}
      className={`${base} ${sizeClass} ${variantClass} w-full`}
      type="button"
    >
      {children}
    </button>
  );
};

export default Keypad;
