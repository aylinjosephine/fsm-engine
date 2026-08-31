export function syncThemeFromParent() {
  const root = document.documentElement

  let mode = 'dark'

  try {
    const parentRoot = window.parent?.document?.documentElement
    if (parentRoot) {
      const parentTheme =
        parentRoot.dataset.theme ||
        (parentRoot.classList.contains('light')
          ? 'light'
          : parentRoot.classList.contains('dark')
            ? 'dark'
            : null)

      if (parentTheme === 'light' || parentTheme === 'dark') {
        mode = parentTheme
      }
    }
  } catch (error) {
    console.debug('FSM engine could not read parent theme, defaulting to dark.', error)
  }

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
