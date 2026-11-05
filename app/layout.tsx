import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Benoit Casa Viva - Simulador de Ambientes com IA',
  description: 'Visualizador inteligente de móveis e eletrodomésticos da Benoit no ambiente real do usuário através de IA Multimodal.',
  openGraph: {
    title: 'Benoit Casa Viva - Simulador de Ambientes com IA',
    description: 'Visualizador inteligente de móveis e eletrodomésticos da Benoit no ambiente real do usuário através de IA Multimodal.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Benoit Casa Viva - Simulador de Ambientes com IA',
    description: 'Visualizador inteligente de móveis e eletrodomésticos da Benoit no ambiente real do usuário através de IA Multimodal.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
