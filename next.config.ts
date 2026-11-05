import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Só afeta o `next dev`: permite abrir o app pelo IP do PC na rede local (ex.: testar no celular).
  // Sem isso o Next 16 bloqueia os scripts de desenvolvimento e a página fica sem interação.
  // Para outro IP, adicione-o aqui ou defina DEV_ORIGINS="ip1,ip2" no .env.
  allowedDevOrigins: [
    '10.0.0.140',
    '172.22.160.1',
    ...(process.env.DEV_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
  ],
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.vtexassets.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.benoit.com.br',
        port: '',
        pathname: '/**',
      },
    ],
  },
  transpilePackages: ['motion'],
};

export default nextConfig;
