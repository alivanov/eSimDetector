import { fireEvent, render, screen } from '@testing-library/react';

import { ConfidenceBlock } from './ConfidenceBlock';
import { GoldenExportForm } from './GoldenExportForm';
import { debugAuxTexts, debugTexts } from './texts';

const response = {
  requestId: 'r-1',
  status: 'supported' as const,
  confidence: 0.9,
  detection: {
    method: 'ua_client_hints_model',
    platform: 'android' as const,
    exactModelKnown: true,
    deviceType: 'phone' as const,
  },
  device: {
    id: 'samsung-galaxy-s24-ultra',
    brand: 'Samsung',
    name: 'Galaxy S24 Ultra',
    esim: { support: 'supported' as const, dualSim: 'physical+esim' as const, maxProfiles: 2 },
  },
  candidates: [],
  reasons: [{ code: 'CATALOG_EXACT_MATCH' }],
  clarification: undefined,
  presentation: {
    title: 'Ваше устройство поддерживает eSIM',
    description: 'ok',
    primaryAction: { label: 'Подключить eSIM', kind: 'continue' as const },
  },
};

describe('ConfidenceBlock', () => {
  it('при confidence 0 показывает пояснение, а не только 0.00', () => {
    render(<ConfidenceBlock confidence={0} />);
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.getByText(debugAuxTexts.confidenceZeroHint)).toBeInTheDocument();
  });

  it('при ненулевой уверенности не показывает пояснение про ноль', () => {
    render(<ConfidenceBlock confidence={0.4} />);
    expect(screen.getByText('0.40')).toBeInTheDocument();
    expect(screen.queryByText(debugAuxTexts.confidenceZeroHint)).not.toBeInTheDocument();
  });
});

describe('GoldenExportForm', () => {
  it('кнопка копирования disabled без описания; поле помечено как обязательное', () => {
    render(
      <GoldenExportForm response={response} sentSignals={{ userAgent: 'x' }} region={undefined} />,
    );

    expect(screen.getByText(debugAuxTexts.goldenExportIntro)).toBeInTheDocument();
    expect(screen.getByText(`(${debugAuxTexts.goldenExportRequiredMark})`)).toBeInTheDocument();

    const copyButton = screen.getByRole('button', { name: debugTexts.copyGoldenEntryButton });
    expect(copyButton).toBeDisabled();
    expect(screen.getByText(debugAuxTexts.goldenExportCopyDisabledHint)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Описание устройства\/браузера/), {
      target: { value: 'Pixel 7, Chrome' },
    });
    expect(copyButton).toBeEnabled();
    expect(screen.queryByText(debugAuxTexts.goldenExportCopyDisabledHint)).not.toBeInTheDocument();
  });

  it('аккордеон «Как заполнять» раскрывает шаги и пример', () => {
    render(<GoldenExportForm response={response} sentSignals={{}} region={undefined} />);

    const toggle = screen.getByRole('button', { name: debugAuxTexts.goldenExportHelpToggle });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(debugAuxTexts.goldenExportHelpExampleTitle)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(debugAuxTexts.goldenExportHelpExampleTitle)).toBeInTheDocument();
    expect(screen.getByText(/Samsung Galaxy S24 Ultra/)).toBeInTheDocument();
  });
});
