const DAY_MS = 24 * 60 * 60 * 1000;

const validDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const finiteNonNegative = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export function calculatePowerForecast({ payments = [], readings = [], now = new Date() }) {
  const purchases = payments
    .filter(payment =>
      (payment.isElectricityPurchase === true || payment.importSource === 'sms' || Boolean(payment.tokenNumber)) &&
      finiteNonNegative(payment.units) > 0
    )
    .map(payment => ({
      ...payment,
      units: finiteNonNegative(payment.units),
      date: validDate(payment.paidAt)
    }))
    .filter(payment => payment.date)
    .sort((a, b) => a.date - b.date);

  const latestPurchase = purchases.at(-1) || null;
  const latestReading = [...readings]
    .map(reading => ({ ...reading, units: finiteNonNegative(reading.units), date: validDate(reading.recordedAt) }))
    .filter(reading => reading.units !== null && reading.date)
    .sort((a, b) => b.date - a.date)[0] || null;
  const sameMeterReadings = latestReading
    ? readings
      .filter(reading => reading.meterId === latestReading.meterId)
      .map(reading => ({ ...reading, units: finiteNonNegative(reading.units), date: validDate(reading.recordedAt) }))
      .filter(reading => reading.units !== null && reading.date)
      .sort((a, b) => a.date - b.date)
    : [];
  const previousReading = sameMeterReadings.at(-2) || null;
  let dailyConsumption = null;
  let consumptionSource = '';

  if (latestReading && previousReading) {
    const elapsedDays = (latestReading.date - previousReading.date) / DAY_MS;
    const consumedUnits = previousReading.units - latestReading.units;
    if (elapsedDays > 0 && consumedUnits > 0) {
      dailyConsumption = consumedUnits / elapsedDays;
      consumptionSource = 'meter readings';
    }
  }

  if (dailyConsumption === null && purchases.length >= 2) {
    let unitsObserved = 0;
    let daysObserved = 0;
    for (let index = 1; index < purchases.length; index += 1) {
      const previous = purchases[index - 1];
      const current = purchases[index];
      const elapsedDays = (current.date - previous.date) / DAY_MS;
      if (elapsedDays > 0) {
        unitsObserved += previous.units;
        daysObserved += elapsedDays;
      }
    }
    if (daysObserved > 0 && unitsObserved > 0) {
      dailyConsumption = unitsObserved / daysObserved;
      consumptionSource = 'historical purchase intervals';
    }
  }

  let availableUnits = latestReading?.units ?? null;
  let availableUnitsSource = latestReading ? 'meter reading' : '';
  if (availableUnits === null && latestPurchase) {
    const recordedBalance = finiteNonNegative(latestPurchase.remainingUnits ?? latestPurchase.unitsBalance);
    if (recordedBalance !== null) {
      availableUnits = recordedBalance;
      availableUnitsSource = 'recorded token balance';
    }
  }
  if (availableUnits === null && latestPurchase && dailyConsumption !== null) {
    const currentTime = validDate(now) || new Date();
    const elapsedDays = Math.max(0, (currentTime - latestPurchase.date) / DAY_MS);
    availableUnits = Math.max(0, latestPurchase.units - dailyConsumption * elapsedDays);
    availableUnitsSource = 'estimated from purchase history';
  }

  const enoughData = dailyConsumption !== null && dailyConsumption > 0 && availableUnits !== null;
  const remainingDays = enoughData ? availableUnits / dailyConsumption : null;
  const exhaustionAt = remainingDays === null
    ? null
    : new Date((validDate(now) || new Date()).getTime() + remainingDays * DAY_MS);
  const status = remainingDays === null
    ? 'unknown'
    : remainingDays <= 3
      ? 'critical'
      : remainingDays <= 7
        ? 'low'
        : 'healthy';

  return {
    availableUnits,
    availableUnitsSource,
    dailyConsumption,
    consumptionSource,
    remainingDays,
    exhaustionAt,
    lastPurchaseAt: latestPurchase?.date || null,
    purchaseCount: purchases.length,
    status
  };
}
