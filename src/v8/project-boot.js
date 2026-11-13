(function () { // one file, several product lines: the hash picks the project (#inj, #press, #eps); a tab reloads with its hash
  var P = /*@PROJECTS@*/, ids = Object.keys(P), id = decodeURIComponent((location.hash || "").slice(1)); if (!P[id]) id = ids[0];
  var p = P[id]; if (window.MFV7_LOAD) window.MFV7_LOAD(id, p, P); window.MF_PROJECT = id; window.MF_DATA = p.data; window.MF_REPLICA = p.replica; window.MF_PLANS = p.plans; window.MF_FLOOR_LIGHT = p.light || {};
  var t = document.getElementById("lines");
  t.innerHTML = ids.map(function (k) { return '<button data-p="' + k + '" class="' + (k === id ? "on" : "") + '" aria-pressed="' + (k === id) + '">' + P[k].tab + "</button>"; }).join("");
  t.onclick = function (e) { var b = e.target.closest("button"); if (b && b.dataset.p !== id) { location.hash = b.dataset.p; location.reload(); } };
})();