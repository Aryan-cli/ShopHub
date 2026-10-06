// Splash Screen Loader - Runs FIRST before anything else
(function() {
  // Create splash HTML immediately
  const splashHTML = `
    <div id="app-splash-screen" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: white;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    ">
      <div id="splash-content" style="
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      "></div>
    </div>
  `;

  document.body.insertAdjacentHTML('afterbegin', splashHTML);
  document.body.style.overflow = 'hidden';

  // Fetch splash config and update
  fetch('/api/splash-screen')
    .then(res => res.json())
    .then(data => {
      if (data && data.isEnabled) {
        const content = document.getElementById('splash-content');
        if (content) {
          content.innerHTML = data.htmlContent;
        }
        
        // Store config globally
        window.__SPLASH_CONFIG__ = data;
        
        if (data.useLoadingMode) {
          // Wait for React to mount
          window.__SPLASH_WAITING_FOR_LOAD__ = true;
        } else {
          // Timer mode
          setTimeout(() => {
            hideSplash();
          }, data.displayDuration || 3000);
        }
      } else {
        hideSplash();
      }
    })
    .catch(err => {
      console.log('Splash fetch error:', err);
      hideSplash();
    });

  // Expose hide function globally
  window.hideSplashScreen = hideSplash;

  function hideSplash() {
    const splash = document.getElementById('app-splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        splash.remove();
        document.body.style.overflow = 'unset';
      }, 300);
    }
  }
})();
