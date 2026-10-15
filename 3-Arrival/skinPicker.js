// Galerie des designs : une vignette (la tête en SVG) par design. Cliquer une vignette règle le
// menu déroulant caché « skin » comme le ferait l'utilisateur (événement change), et la vignette
// active suit la valeur de ce menu. Le conteneur, le menu et la fabrique de boutons sont injectés.
const SkinPicker = (() => {
  function defaultButton(skin) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'skin';
    button.title = skin.label;
    button.setAttribute('aria-label', skin.label);
    const image = document.createElement('img');
    image.src = Skins.dataUrl(Skins.headSvg(skin));
    image.alt = '';
    button.appendChild(image);
    return button;
  }

  function bind(container, select, makeButton = defaultButton) {
    const buttons = new Map();
    const refresh = () => {
      for (const [id, button] of buttons) {
        const active = id === select.value;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    };
    for (const skin of Skins.LIST) {
      const button = makeButton(skin);
      button.addEventListener('click', () => {
        select.value = skin.id;
        select.dispatchEvent(new Event('change'));
      });
      buttons.set(skin.id, button);
      container.appendChild(button);
    }
    select.addEventListener('change', refresh);
    refresh();
    return { refresh, buttons };
  }

  return { bind };
})();
