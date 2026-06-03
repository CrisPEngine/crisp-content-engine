chrome.sidePanel
	.setPanelBehavior({ openPanelOnActionClick: true })
	.catch(() => {
		/* side panel may be unavailable on older Chrome */
	});
