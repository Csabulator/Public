/* ===================== boot ===================== */
initLang();
bindRaceControls();
bindRallyControls();
SND.paint();
S = load();
render();
if (LOAD_MSG) modal(`<h3>${t('load.t')}</h3><p>${t('load.p')}</p><p class="small muted">${t('load.p2')}</p><button class="btn pri block" data-close>${t('load.ok')}</button>`);
