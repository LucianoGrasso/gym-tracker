import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import localeEsCl from '@angular/common/locales/es-CL';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { routes } from './app.routes';
import { csrfRetryInterceptor } from './core/auth/csrf-retry.interceptor';

registerLocaleData(localeEsCl);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      // Angular solo envía X-XSRF-TOKEN en peticiones mutantes a URLs relativas (nuestro caso, vía proxy/CloudFront).
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([csrfRetryInterceptor]),
    ),
    { provide: LOCALE_ID, useValue: 'es-CL' },
    // ECharts se descarga recién al abrir el primer gráfico.
    provideEchartsCore({ echarts: () => import('./shared/charts/echarts-setup').then((m) => m.default) }),
  ],
};
