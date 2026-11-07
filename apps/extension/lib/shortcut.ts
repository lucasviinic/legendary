/** ⌘⇧B, o mesmo atalho do app. Usa a posição da tecla, que não muda com o layout do teclado. */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  return (
    event.code === 'KeyB' &&
    event.metaKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.repeat
  );
}
