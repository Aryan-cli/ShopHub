import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface SplashScreenData {
  id: string;
  htmlContent: string;
  isEnabled: boolean;
  displayDuration: number;
  useLoadingMode?: boolean;
}

export function SplashScreenComponent() {
  useEffect(() => {
    // If waiting for loading mode, signal that React has mounted
    if (window.__SPLASH_WAITING_FOR_LOAD__) {
      // Give React time to fully render
      setTimeout(() => {
        if (window.hideSplashScreen) {
          window.hideSplashScreen();
        }
      }, 100);
    }
  }, []);

  return null;
}
