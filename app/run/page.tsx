import dynamic from 'next/dynamic';

const RunClient = dynamic(() => import('../../components/run/run-client'), { ssr: false });

export default function RunPage() {
  return <RunClient />;
}
