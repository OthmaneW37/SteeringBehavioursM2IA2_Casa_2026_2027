// Bouton qui masque ou affiche le menu des réglages ; le canvas reprend la place libérée.
// Le document est injecté pour pouvoir tester sans navigateur.
const MenuToggle = {
    toggle(doc, button) {
        const hidden = doc.body.classList.toggle('menu-hidden');
        button.textContent = hidden ? '☰ Menu' : '✕';
        button.setAttribute('aria-expanded', String(!hidden));
        return hidden;
    }
};
