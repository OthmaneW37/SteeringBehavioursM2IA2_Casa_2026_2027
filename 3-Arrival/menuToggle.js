// Bouton qui affiche ou masque le menu des paramètres. Le panneau utilise l'attribut
// `hidden` ; le bouton reflète l'état (texte et aria-expanded). onChange(hidden) est
// appelé après chaque bascule de l'utilisateur, par exemple pour redimensionner le canvas
// quand le menu libère ou reprend de la place. Le panneau et le bouton sont injectés,
// ce qui permet de tester sans navigateur.
const MenuToggle = (() => {
  const LABEL_SHOWN = '◀ Masquer';
  const LABEL_HIDDEN = '☰ Menu';

  function bind(button, panel, onChange = () => {}) {
    const apply = hidden => {
      panel.hidden = hidden;
      button.setAttribute('aria-expanded', String(!hidden));
      button.textContent = hidden ? LABEL_HIDDEN : LABEL_SHOWN;
    };
    const toggle = () => {
      apply(!panel.hidden);
      onChange(panel.hidden);
    };
    apply(Boolean(panel.hidden));
    button.addEventListener('click', toggle);
    return { toggle, isHidden: () => panel.hidden };
  }

  return { LABEL_SHOWN, LABEL_HIDDEN, bind };
})();
