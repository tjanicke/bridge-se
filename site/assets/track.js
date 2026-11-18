/* Bridge SE: Umami events that show real use of a tool, not just a page view.
   Sends the tool name and the action only. No input values or results ever leave the page. */
(function () {
  var NAMES = {
    'just-live-load': 'Just Live Load', 'steel-line-girder': 'Steel Line Girder',
    'concrete-line-girder': 'Concrete Line Girder', 'concrete-slab-bridge': 'Concrete Slab Bridge',
    'concrete-box-culvert': 'Concrete Box Culvert', 'just-lap-splices': 'Just Lap Splices'
  };
  var slug = Object.keys(NAMES).filter(function (k) { return location.pathname.indexOf('/' + k + '/') >= 0; })[0];
  var tool = NAMES[slug] || (document.title.split('|')[0] || 'Bridge SE').trim();
  var sent = {};
  function send(action) {
    if (sent[action]) return;              // once per action per page load
    sent[action] = true;
    var name = tool + ': ' + action;
    var go = function () {
      if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, { tool: tool });
    };
    if (window.umami) go(); else window.addEventListener('load', go, { once: true });
  }
  // The visitor changed an input: they used the tool rather than glancing at it.
  function edited(e) {
    if (e.isTrusted && e.target.closest && e.target.closest('input, select, textarea')) send('Edited inputs');
  }
  document.addEventListener('input', edited, true);
  document.addEventListener('change', edited, true);
  // Buttons that run, keep or share results. Theme, add/remove and reset buttons are ignored.
  var KEEP = /^(save|open|export|copy|print|run|analy[sz]e|propose|check the standard|use this design|input json|load from text|apply pasted)/i;
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b) return;
    var label = (b.textContent || '').replace(/\s+/g, ' ').replace(/[…\.]+$/, '').trim();
    if (KEEP.test(label)) send(label);
  }, true);
  window.addEventListener('beforeprint', function () { send('Printed'); });
})();
