/* Booking alerts are isolated from existing order polling and credentials. */
(() => {
  let lastId = null;
  async function pollBookings() {
    const badge = document.getElementById('booking-badge');
    if (!badge || document.getElementById('app')?.style.display === 'none') return;
    try {
      const response = await fetch('/admin/bookings?mode=alerts', {cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json();
      const count = Number(data.unread || 0);
      badge.style.display = count > 0 ? '' : 'none';
      badge.textContent = String(Math.min(count,999));
      if (lastId !== null && Number(data.last_id) > lastId && count > 0) {
        if (typeof playBeep === 'function') playBeep();
        if (typeof notify === 'function') notify('Nuova prenotazione tavolo!', 'info', 5500);
      }
      lastId = Number(data.last_id || 0);
    } catch {}
  }
  pollBookings();
  setInterval(() => {
    if (document.visibilityState !== 'hidden') pollBookings();
  }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollBookings();
  });
})();