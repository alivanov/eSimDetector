import { fireEvent, render, screen } from '@testing-library/react';

import { CandidateOptionsList } from './CandidateOptionsList';

describe('CandidateOptionsList', () => {
  const options = [
    { id: 'apple-iphone-x', label: 'iPhone X' },
    { id: 'apple-iphone-xs', label: 'iPhone XS' },
    { id: '__other__', label: 'Другая модель' },
  ];

  it('рендерит все варианты как доступные с клавиатуры кнопки в именованной группе', () => {
    render(
      <CandidateOptionsList options={options} groupLabel="Выберите вариант" onChoose={jest.fn()} />,
    );

    expect(screen.getByRole('group', { name: 'Выберите вариант' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'iPhone X' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'iPhone XS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Другая модель' })).toBeInTheDocument();
  });

  it('клик по варианту вызывает onChoose с этим вариантом', () => {
    const onChoose = jest.fn();
    render(
      <CandidateOptionsList options={options} groupLabel="Выберите вариант" onChoose={onChoose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'iPhone XS' }));
    expect(onChoose).toHaveBeenCalledWith({ id: 'apple-iphone-xs', label: 'iPhone XS' });
  });
});
