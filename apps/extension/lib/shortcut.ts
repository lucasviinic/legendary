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
