/** @type {import('next').NextConfig} */
const nextConfig = {
  // Для работы с Python сервисом
  async rewrites() {
    return [
      {
        source: '/python-api/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
