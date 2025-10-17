import dynamic from 'next/dynamic';

const ConfigClient = dynamic(() => import('../../components/config/config-client'), { ssr: false });

export default function ConfigPage() {
  return <ConfigClient />;
}
