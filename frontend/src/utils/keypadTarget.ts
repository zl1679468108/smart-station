/**
 * 判断焦点是否在可原生输入的表单控件上。
 * 查询门户的只读输入框不算，以便实体键盘仍可走虚拟键盘事件通道。
 */
export function isNativeEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  if (target instanceof HTMLTextAreaElement) {
    return !target.readOnly && !target.disabled;
  }

  if (target instanceof HTMLSelectElement) {
    return !target.disabled;
  }

  if (target instanceof HTMLInputElement) {
    if (target.readOnly || target.disabled) return false;
    const type = (target.type || 'text').toLowerCase();
    return ![
      'button',
      'submit',
      'checkbox',
      'radio',
      'file',
      'reset',
      'image',
      'hidden',
      'range',
      'color',
    ].includes(type);
  }

  return false;
}
