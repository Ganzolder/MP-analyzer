/** @type {import('next').NextConfig} */
const nextConfig = {
  // Для работы с Python сервисом (только в development)
  async rewrites() {
    // На Vercel Python сервис должен быть отдельным сервисом или отключён
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/python-api/:path*',
          destination: process.env.PYTHON_SERVICE_URL 
            ? `${process.env.PYTHON_SERVICE_URL}/:path*`
            : 'http://localhost:8000/:path*',
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
