export function getCurrentThemeMode() {
  if (typeof document === 'undefined') return 'dark'

  try {
    const parentRoot = window.parent?.document?.documentElement
    if (parentRoot && parentRoot !== document.documentElement) {
      const parentTheme =
        parentRoot.dataset.theme ||
        (parentRoot.classList.contains('light')
          ? 'light'
          : parentRoot.classList.contains('dark')
            ? 'dark'
            : null)

      if (parentTheme === 'light' || parentTheme === 'dark') {
        return parentTheme
      }
    }
  } catch (error) {
    console.debug('FSM engine could not read parent theme, falling back to iframe theme.', error)
  }

  const root = document.documentElement
  const modeFromRoot = root.dataset.theme || (root.classList.contains('light') ? 'light' : null)
  if (modeFromRoot === 'light' || modeFromRoot === 'dark') return modeFromRoot

  return 'dark'
}

export function syncThemeFromParent() {
  const root = document.documentElement
  const mode = getCurrentThemeMode()

  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('light', mode === 'light')
  root.dataset.theme = mode
  root.style.colorScheme = mode

  return mode
}

export function observeParentTheme() {
  const sync = () => syncThemeFromParent()
  sync()

  try {
    const parentRoot = window.parent?.document?.documentElement
    if (!parentRoot || parentRoot === document.documentElement) {
      return () => {}
    }

    const observer = new MutationObserver(sync)
    observer.observe(parentRoot, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    return () => observer.disconnect()
  } catch (error) {
    console.debug('FSM engine theme observer could not be installed.', error)
    return () => {}
  }
}
