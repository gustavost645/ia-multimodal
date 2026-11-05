export interface BenoitProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: 'estofados' | 'linha-branca' | 'dormitorios' | 'cozinha' | 'tvs-audio' | 'outros';
  categoryLabel: string;
  price: number;
  installment: string;
  originalPrice?: number;
  dimensions: {
    widthCm: number;       // Largura
    heightCm: number;      // Altura
    depthCm: number;       // Profundidade
    openDepthCm?: number;  // Profundidade com portas abertas ou reclinado
    weightKg?: number;
  };
  imageUrl: string;
  /** Todas as fotos do produto (quando importado do site) */
  images?: string[];
  /** 'oficial' = ficha técnica da Benoit; 'estimada' = inferida do nome ou da categoria */
  dimensionsSource?: 'oficial' | 'estimada';
  /** Disponibilidade em estoque no e-commerce */
  available?: boolean;
  /** Medidas da caixa de entrega (para conferir se passa pela porta/elevador) */
  packageDimensions?: { widthCm: number; heightCm: number; depthCm: number; weightKg?: number };
  /** Vendedor na VTEX (necessário para carrinho e frete) */
  sellerId?: string;
  badge?: string;
  color: string;
  productUrl: string;
  description: string;
  specs: { label: string; value: string }[];
  clearanceRequirements: {
    minSideCm: number;
    minTopCm: number;
    minFrontCm: number;
    warningNote?: string;
  };
}

export const BENOIT_CATALOG: BenoitProduct[] = [
  {
    id: 'sofa-ret-berlim',
    sku: 'BN-88231',
    name: 'Sofá Retrátil e Reclinável 3 Lugares Berlim Suede Grafite',
    brand: 'Estofados Benoit',
    category: 'estofados',
    categoryLabel: 'Estofados & Sala',
    price: 2199.00,
    originalPrice: 2699.00,
    installment: '10x de R$ 219,90 sem juros',
    badge: 'Mais Vendido',
    color: 'Grafite',
    dimensions: {
      widthCm: 220,
      heightCm: 105,
      depthCm: 100,
      openDepthCm: 160,
      weightKg: 65,
    },
    imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80',
    productUrl: 'https://www.benoit.com.br/sofa-retratil-reclinavel-3-lugares-berlim-grafite',
    description: 'Conforto supremo com assento retrátil e encosto reclinável em várias posições, espuma D-28 e revestimento em suede aveludado resistente.',
    specs: [
      { label: 'Estrutura', value: 'Madeira maciça de eucalipto reflorestado' },
      { label: 'Assento', value: 'Espuma D-28 com molas ensacadas' },
      { label: 'Mecanismo', value: 'Aço carbono com trava' },
      { label: 'Garantia', value: '12 meses' },
    ],
    clearanceRequirements: {
      minSideCm: 15,
      minTopCm: 0,
      minFrontCm: 60,
      warningNote: 'Requer ao menos 1,60m livre à frente quando o assento estiver totalmente estendido.',
    },
  },
  {
    id: 'poltrona-viena-mostarda',
    sku: 'BN-44109',
    name: 'Poltrona Decorativa Viena Pés Palito Linho Mostarda',
    brand: 'Decor Benoit',
    category: 'estofados',
    categoryLabel: 'Estofados & Sala',
    price: 649.90,
    originalPrice: 799.00,
    installment: '10x de R$ 64,99 sem juros',
    badge: 'Destaque Tendência',
    color: 'Mostarda',
    dimensions: {
      widthCm: 75,
      heightCm: 85,
      depthCm: 78,
      weightKg: 18,
    },
    imageUrl: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=800&q=80',
    productUrl: 'https://www.benoit.com.br/poltrona-decorativa-viena-mostarda',
    description: 'Design escandinavo com pés em madeira maciça jequitibá e tecido linho premium de alta durabilidade.',
    specs: [
      { label: 'Pés', value: 'Madeira Maciça Palito' },
      { label: 'Espuma', value: 'D-26 Soft' },
      { label: 'Suporta até', value: '120 kg' },
    ],
    clearanceRequirements: {
      minSideCm: 10,
      minTopCm: 0,
      minFrontCm: 45,
    },
  },
  {
    id: 'geladeira-frost-free-inox',
    sku: 'BN-10992',
    name: 'Refrigerador Frost Free Duplex 443L Inverse Titanium Inox',
    brand: 'Brastemp / Linha Benoit',
    category: 'linha-branca',
    categoryLabel: 'Linha Branca',
    price: 4399.00,
    originalPrice: 4899.00,
    installment: '10x de R$ 439,90 sem juros',
    badge: 'Eco Eficiente A+++',
    color: 'Inox / Titanium',
    dimensions: {
      widthCm: 72,
      heightCm: 184,
      depthCm: 75,
      openDepthCm: 135,
      weightKg: 82,
    },
    imageUrl: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=800&q=80',
    productUrl: 'https://www.benoit.com.br/refrigerador-frost-free-duplex-inverse-titanium',
    description: 'Refrigerador moderno com freezer na parte inferior (Inverse), painel touch externo e tecnologia de resfriamento turbo inteligente.',
    specs: [
      { label: 'Capacidade Total', value: '443 Litros (Refrigerador 318L / Freezer 125L)' },
      { label: 'Voltagem', value: '127V ou 220V' },
      { label: 'Tecnologia', value: 'Smart Ice + Turbo Freezer' },
      { label: 'Consumo', value: 'Selo Procel A+++' },
    ],
    clearanceRequirements: {
      minSideCm: 10,
      minTopCm: 15,
      minFrontCm: 60,
      warningNote: 'Deixe 10cm livres nas laterais e no fundo para ventilação térmica do motor do refrigerador.',
    },
  },
  {
    id: 'fogao-5-bocas-cooktop-vidro',
    sku: 'BN-33215',
    name: 'Fogão 5 Bocas Piso Mesa de Vidro Temperado Preto com Tripla Chama',
    brand: 'Dako / Benoit',
    category: 'linha-branca',
    categoryLabel: 'Linha Branca',
    price: 1849.00,
    originalPrice: 2199.00,
    installment: '10x de R$ 184,90 sem juros',
    badge: 'Design Cooktop',
    color: 'Preto com Vidro',
    dimensions: {
      widthCm: 76,
      heightCm: 94,
      depthCm: 65,
      openDepthCm: 110,
      weightKg: 38,
    },
    imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80',
    productUrl: 'https://www.benoit.com.br/fogao-5-bocas-mesa-vidro-tripla-chama',
    description: 'Visual contemporâneo que combina a beleza do cooktop com a praticidade do fogão de piso e forno autolimpante com porta de vidro panorâmico.',
    specs: [
      { label: 'Queimadores', value: '5 Bocas (1 Tripla Chama 3.3kW, 2 Rápidos, 2 Semirrápidos)' },
      { label: 'Forno', value: '100 Litros com grill elétrico' },
      { label: 'Trempes', value: 'Ferro fundido individual reforçado' },
    ],
    clearanceRequirements: {
      minSideCm: 8,
      minTopCm: 80,
      minFrontCm: 50,
      warningNote: 'Mantenha distância mínima de 80cm em relação a depuradores ou armários aéreos superiores.',
    },
  },
  {
    id: 'lava-e-seca-11kg-smart',
    sku: 'BN-66524',
    name: 'Lava e Seca Smart 11kg Front Load com Inteligência Artificial Inox Look',
    brand: 'LG / Benoit',
    category: 'linha-branca',
    categoryLabel: 'Linha Branca',
    price: 3899.00,
    originalPrice: 4299.00,
    installment: '10x de R$ 389,90 sem juros',
    badge: 'Vapor Steam+',
    color: 'Inox Look / Grafite',
    dimensions: {
      widthCm: 60,
      heightCm: 85,
      depthCm: 66,
      openDepthCm: 112,
      weightKg: 70,
    },
    imageUrl: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=800&q=80',
    productUrl: 'https://www.benoit.com.br/lava-e-seca-11kg-smart-inox-look',
    description: 'Lavagem inteligente com motor Direct Drive e sensores que detectam o peso e o tipo de tecido para preservar as roupas.',
    specs: [
      { label: 'Capacidade', value: 'Lava 11kg / Seca 7kg' },
      { label: 'Conectividade', value: 'Wi-Fi ThinQ' },
      { label: 'Motor', value: 'Inverter Direct Drive (10 anos garantia)' },
    ],
    clearanceRequirements: {
      minSideCm: 5,
      minTopCm: 2,
      minFrontCm: 55,
      warningNote: 'Abertura frontal requer mínimo de 55cm livres para rotação completa da escotilha.',
    },
  },
  {
    id: 'guarda-roupa-casal-espelho',
    sku: 'BN-77189',
    name: 'Guarda-Roupa Casal 6 Portas 4 Gavetas com Espelho Nobre Carvalho',
    brand: 'Móveis Benoit',
    category: 'dormitorios',
    categoryLabel: 'Dormitórios',
    price: 1999.00,
    originalPrice: 2499.00,
    installment: '10x de R$ 199,90 sem juros',
    badge: '100% MDF',
    color: 'Carvalho / Off-White',
    dimensions: {
      widthCm: 240,
      heightCm: 228,
      depthCm: 56,
      openDepthCm: 105,
      weightKg: 145,
    },
    imageUrl: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=800&q=80',
    productUrl: 'https://www.benoit.com.br/guarda-roupa-casal-6-portas-espelho-carvalho',
    description: 'Espaço interno inteligente com cabideiros em alumínio, corrediças telescópicas e espelho lapidado na porta central.',
    specs: [
      { label: 'Material', value: '100% MDF 15mm' },
      { label: 'Gavetas', value: '4 gavetas com corrediças telescópicas' },
      { label: 'Portas', value: '6 portas de bater com amortecedores' },
    ],
    clearanceRequirements: {
      minSideCm: 5,
      minTopCm: 10,
      minFrontCm: 70,
      warningNote: 'Verifique a altura do pé-direito da sua residência (mínimo 2,38m para montagem em pé).',
    },
  },
  {
    id: 'painel-tv-ripado-75',
    sku: 'BN-55412',
    name: 'Home Theater Painel Ripado com LED e Rack Suspenso para TV até 75"',
    brand: 'Decor Benoit',
    category: 'estofados',
    categoryLabel: 'Estofados & Sala',
    price: 1399.00,
    originalPrice: 1799.00,
    installment: '10x de R$ 139,90 sem juros',
    badge: 'Fita LED Inclusa',
    color: 'Freijó com Off White',
    dimensions: {
      widthCm: 210,
      heightCm: 180,
      depthCm: 36,
      weightKg: 78,
    },
    imageUrl: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=800&q=80',
    productUrl: 'https://www.benoit.com.br/home-theater-painel-ripado-led-tv-75',
    description: 'Elegância no ripado de verdade em MDF, com iluminação suave em LED embutido e nichos para receptores e decorações.',
    specs: [
      { label: 'Suporte TV', value: 'Até 75 polegadas' },
      { label: 'Iluminação', value: 'Fita de LED Bivolt com interruptor' },
      { label: 'Portas basculantes', value: '2 com pistão a gás' },
    ],
    clearanceRequirements: {
      minSideCm: 10,
      minTopCm: 20,
      minFrontCm: 50,
    },
  },
  {
    id: 'smart-tv-65-uhd',
    sku: 'BN-99431',
    name: 'Smart TV 65" 4K UHD HDR Crystal Processador IA e Gaming Hub',
    brand: 'Samsung / Benoit',
    category: 'tvs-audio',
    categoryLabel: 'TVs & Áudio',
    price: 3499.00,
    originalPrice: 3999.00,
    installment: '10x de R$ 349,90 sem juros',
    badge: 'Tela Sem Bordas',
    color: 'Titan Black',
    dimensions: {
      widthCm: 145,
      heightCm: 89,
      depthCm: 28,
      weightKg: 21,
    },
    imageUrl: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80',
    productUrl: 'https://www.benoit.com.br/smart-tv-65-4k-uhd-crystal-gaming-hub',
    description: 'Imagens ultra nítidas com cores vivas e controle remoto solar recarregável sem necessidade de pilhas.',
    specs: [
      { label: 'Resolução', value: '4K Ultra HD (3840 x 2160)' },
      { label: 'Taxa de Atualização', value: '60Hz com Motion Xcelerator' },
      { label: 'Conexões', value: '3 HDMI, 2 USB, Bluetooth 5.2, Wi-Fi 5' },
    ],
    clearanceRequirements: {
      minSideCm: 10,
      minTopCm: 10,
      minFrontCm: 180,
      warningNote: 'Distância recomendada de visualização para 65 polegadas: entre 1,80m e 2,50m.',
    },
  },
];

export interface RoomSample {
  id: string;
  name: string;
  roomType: string;
  imageUrl: string;
  defaultPosition: { x: number; y: number }; // Percentual da imagem (0 a 100)
  estimatedSpaceCm: {
    widthCm: number;
    heightCm: number;
    depthCm: number;
  };
  lightingDescription: string;
}

export const SAMPLE_ROOMS: RoomSample[] = [
  {
    id: 'sala-moderna',
    name: 'Sala de Estar Contemporânea',
    roomType: 'Sala de Estar',
    imageUrl: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
    defaultPosition: { x: 50, y: 72 },
    estimatedSpaceCm: {
      widthCm: 240,
      heightCm: 250,
      depthCm: 180,
    },
    lightingDescription: 'Luz natural vinda da janela lateral direita, piso de porcelanato cinza acetinado.',
  },
  {
    id: 'cozinha-gourmet',
    name: 'Cozinha com Bancada Aberta',
    roomType: 'Cozinha / Área Gourmet',
    imageUrl: 'https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=1200&q=80',
    defaultPosition: { x: 42, y: 68 },
    estimatedSpaceCm: {
      widthCm: 90,
      heightCm: 200,
      depthCm: 85,
    },
    lightingDescription: 'Iluminação em spots de LED embutidos e luz quente de apoio.',
  },
  {
    id: 'quarto-aconchegante',
    name: 'Quarto com Parede de Destaque',
    roomType: 'Dormitório',
    imageUrl: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
    defaultPosition: { x: 55, y: 65 },
    estimatedSpaceCm: {
      widthCm: 260,
      heightCm: 260,
      depthCm: 120,
    },
    lightingDescription: 'Luz suave indireta, piso vinílico amadeirado claro.',
  },
];
