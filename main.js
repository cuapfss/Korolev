// KOROLEV — responsive navigation and Telegram enquiry form
document.addEventListener('DOMContentLoaded', () => {
  const menuButton = document.querySelector('.menu');
  const navLinks = document.querySelector('.links');

  if (menuButton && navLinks) {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        menuButton.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        navLinks.classList.remove('open');
        menuButton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.querySelectorAll('form[data-telegram]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      const lines = ['Заявка с сайта KOROLEV'];
      for (const [key, value] of data.entries()) {
        const cleanValue = String(value).trim();
        if (cleanValue) lines.push(`${key}: ${cleanValue}`);
      }
      const url = `https://t.me/vosopo?text=${encodeURIComponent(lines.join('\n'))}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  });
});
