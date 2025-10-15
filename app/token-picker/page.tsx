import dynamic from 'next/dynamic';

const TokenPickerClient = dynamic(() => import('../../components/token-picker/token-picker-client'), { ssr: false });

export default function TokenPickerPage() {
  return <TokenPickerClient />;
}
