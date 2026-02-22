import CalculatorWidget from '@/components/calculator/CalculatorWidget';
import { Loader2, SearchX } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function Calculator() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const isEmbed = params.get('embed') === 'true';

  const { data: calculator, isLoading, error } = useQuery<any>({
    queryKey: ['/api/calculators/lookup', { slug }],
    queryFn: async () => {
      if (!slug) throw new Error('No slug');
      const res = await fetch(`/api/calculators/lookup?slug=${slug}`);
      const data = await res.json();
      if (!res.ok || !data.calculator) throw new Error(data.error || 'Calculator not found.');
      fetch('/api/calculators/track-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calculator_id: data.calculator.id }),
      });
      return data.calculator;
    },
    enabled: !!slug,
  });

  if (!slug) {
    window.location.href = '/Wizard';
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="text-center">
          <SearchX className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2" data-testid="text-error-title">Calculator Not Found</h2>
          <p className="text-slate-500 mb-6" data-testid="text-error-message">{(error as Error).message}</p>
          <a
            href="/Wizard"
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)' }}
            data-testid="link-create-calculator"
          >
            Create a Calculator
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={isEmbed ? '' : 'min-h-screen bg-slate-50 py-8 px-4'}>
      <CalculatorWidget calculator={calculator} isEmbed={isEmbed} />
    </div>
  );
}
