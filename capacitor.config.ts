import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.meusgastos.app',
  appName: 'Meus Gastos',
  webDir: 'dist',
  plugins: {
    // Faz o fetch() passar pela camada nativa: o app fala direto com api.pluggy.ai sem esbarrar em CORS.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
