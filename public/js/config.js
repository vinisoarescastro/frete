'use strict';
/* Constantes e configuração padrão. Nenhum custo do veículo é inventado: tudo começa zerado. */
export const HOME_DEFAULT = 'Rua Martins, 43, Jardim Mariliza, Goiânia - GO';
export const KEY_S = 'frete.settings.v2', KEY_Q = 'frete.draft.v1';

export const DEFAULT_SETTINGS = {
  home: HOME_DEFAULT, providerName: 'Vinicius Soares', providerPhone: '(62) 99700-5796', validityDays: '3', quoteNotice: 'O valor é somente do transporte.',
  vehicleType: 'Carro com carretinha', fuelType: 'gasolina',
  gasPrice: '6.69', kmPerL: '9.5', etaPrice: '4.56', etaKmPerL: '7.5',
  // ESTIMATIVAS INICIAIS (ajuste conforme seus gastos reais): carro + carretinha
  costMaint: '0.15', costTires: '0.10', costDeprec: '0.25', costOther: '0',
  defTolls: '', defParking: '', defFood: '', defOther: '', laborRate: '25',
  margin: '50', cardFee: '5', tax: '', minCharge: '90', ratePerKm: '2.5', rounding: '1'
};
