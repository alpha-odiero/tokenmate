const DAY_MS = 24 * 60 * 60 * 1000;
const FAILED_STATUSES = new Set(['failed', 'pending', 'cancelled', 'canceled', 'declined', 'reversed', 'refunded', 'void', 'voided']);

const validDate = value => {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const finiteNonNegative = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const finitePositive = value => {
  const number = finiteNonNegative(value);
  return number !== null && number > 0 ? number : null;
};

const meterKeyOf = value => String(value ?? '').trim().toLowerCase();

const meterLabelOf = value => String(value ?? '').trim();

const transactionStatusOf = payment => String(
  payment.transactionStatus ?? payment.purchaseStatus ?? payment.status ?? ''
).trim().toLowerCase();

const isSuccessfulPurchase = payment => {
  const status = transactionStatusOf(payment);
  return !status || !FAILED_STATUSES.has(status);
};

const purchaseKeyOf = (payment, index) => {
  const token = String(payment.tokenNumber || '').replace(/\D/g, '');
  if (token) return `token:${token}`;
  const reference = String(payment.sourceTransactionRef || payment.transactionRef || '').trim();
  if (reference) return `ref:${reference}`;
  if (payment.id) return `id:${payment.id}`;
  return `row:${index}`;
};

const shortDate = value => new Intl.DateTimeFormat('en-KE', {
  timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric'
}).format(value);

export function calculatePowerForecast({ payments = [], readings = [], now = new Date() }) {
  const warnings = [];

  const paymentsWithUnits = payments.filter(payment => finitePositive(payment.units) !== null);
  const failedPurchases = paymentsWithUnits.filter(payment => !isSuccessfulPurchase(payment));
  if (failedPurchases.length) {
    warnings.push(`${failedPurchases.length} failed or incomplete payment record${failedPurchases.length === 1 ? ' was' : 's were'} excluded from the power calculations.`);
  }

  const invalidPurchaseBalances = paymentsWithUnits.filter(payment => {
    const hasBalance = payment.remainingUnits != null || payment.unitsBalance != null;
    return hasBalance && finiteNonNegative(payment.remainingUnits ?? payment.unitsBalance) === null;
  }).length;
  if (invalidPurchaseBalances) {
    warnings.push(`${invalidPurchaseBalances} token purchase balance${invalidPurchaseBalances === 1 ? ' was' : 's were'} negative or invalid and ${invalidPurchaseBalances === 1 ? 'was' : 'were'} ignored.`);
  }

  const successfulPayments = paymentsWithUnits.filter(isSuccessfulPurchase);
  const invalidPurchaseDates = successfulPayments.filter(payment => !validDate(payment.paidAt)).length;
  if (invalidPurchaseDates) {
    warnings.push(`${invalidPurchaseDates} token purchase${invalidPurchaseDates === 1 ? ' has' : 's have'} no valid date and ${invalidPurchaseDates === 1 ? 'was' : 'were'} excluded.`);
  }

  const rawPurchases = successfulPayments
    .map(payment => ({
      id: payment.id,
      date: validDate(payment.paidAt),
      units: finitePositive(payment.units),
      remainingUnits: finiteNonNegative(payment.remainingUnits ?? payment.unitsBalance),
      meterKey: meterKeyOf(payment.meterId ?? payment.meterNumber ?? payment.meter),
      meterLabel: meterLabelOf(payment.meterId ?? payment.meterNumber ?? payment.meter),
      record: payment
    }))
    .filter(purchase => purchase.date && purchase.units !== null);

  const purchasesByKey = new Map();
  let duplicatePurchases = 0;
  [...rawPurchases].sort((a, b) => a.date - b.date).forEach((purchase, index) => {
    const key = purchaseKeyOf(purchase.record, index);
    if (purchasesByKey.has(key)) {
      duplicatePurchases += 1;
      return;
    }
    purchasesByKey.set(key, purchase);
  });
  if (duplicatePurchases) {
    warnings.push(`${duplicatePurchases} duplicate token purchase record${duplicatePurchases === 1 ? ' was' : 's were'} counted only once.`);
  }
  const purchases = [...purchasesByKey.values()].sort((a, b) => a.date - b.date);

  const invalidReadingBalances = readings.filter(reading => {
    const date = validDate(reading.recordedAt);
    return date && finiteNonNegative(reading.units ?? reading.reading) === null;
  }).length;
  if (invalidReadingBalances) {
    warnings.push(`${invalidReadingBalances} meter reading${invalidReadingBalances === 1 ? ' had' : 's had'} a negative or invalid balance and ${invalidReadingBalances === 1 ? 'was' : 'were'} excluded.`);
  }

  const invalidReadingDates = readings.filter(reading => !validDate(reading.recordedAt)).length;
  if (invalidReadingDates) {
    warnings.push(`${invalidReadingDates} meter reading${invalidReadingDates === 1 ? ' has' : 's have'} no valid date and ${invalidReadingDates === 1 ? 'was' : 'were'} excluded.`);
  }

  const rawReadings = readings
    .map(reading => ({
      date: validDate(reading.recordedAt),
      units: finiteNonNegative(reading.units ?? reading.reading),
      meterKey: meterKeyOf(reading.meterId) || 'apartment meter',
      meterLabel: meterLabelOf(reading.meterId) || 'Apartment meter'
    }))
    .filter(reading => reading.date && reading.units !== null);

  const readingsByKey = new Map();
  let duplicateReadings = 0;
  [...rawReadings].sort((a, b) => a.date - b.date).forEach(reading => {
    const key = `${reading.meterKey}|${reading.date.getTime()}`;
    if (readingsByKey.has(key)) duplicateReadings += 1;
    readingsByKey.set(key, reading);
  });
  if (duplicateReadings) {
    warnings.push(`${duplicateReadings} duplicate meter reading${duplicateReadings === 1 ? ' was' : 's were'} merged by meter and timestamp.`);
  }
  const allReadings = [...readingsByKey.values()].sort((a, b) => a.date - b.date);

  const latestReading = allReadings.at(-1) || null;
  const latestMeterPurchase = [...purchases].reverse().find(purchase => purchase.meterKey) || null;
  const primaryMeterKey = latestReading?.meterKey || latestMeterPurchase?.meterKey || '';
  const primaryMeterLabel = latestReading?.meterLabel || latestMeterPurchase?.meterLabel || '';
  const readingsForMeter = primaryMeterKey
    ? allReadings.filter(reading => reading.meterKey === primaryMeterKey)
    : [];
  const meterCount = new Set(allReadings.map(reading => reading.meterKey)).size;
  if (meterCount > 1) {
    warnings.push(`Meter readings from ${meterCount} different meters were found. The forecast uses ${primaryMeterLabel || 'the most recently read meter'} only.`);
  }

  const otherMeterPurchases = primaryMeterKey
    ? purchases.filter(purchase => purchase.meterKey && purchase.meterKey !== primaryMeterKey).length
    : 0;
  if (otherMeterPurchases) {
    warnings.push(`${otherMeterPurchases} token purchase${otherMeterPurchases === 1 ? ' belongs' : 's belong'} to another meter and ${otherMeterPurchases === 1 ? 'was' : 'were'} ignored.`);
  }
  const relevantPurchases = primaryMeterKey
    ? purchases.filter(purchase => !purchase.meterKey || purchase.meterKey === primaryMeterKey)
    : purchases;

  const latestReadingForMeter = readingsForMeter.at(-1) || null;
  let availableUnits = null;
  let availableUnitsSource = '';
  let availableReason = '';

  if (latestReadingForMeter) {
    availableUnits = latestReadingForMeter.units;
    availableUnitsSource = `Latest meter balance${primaryMeterLabel ? ` (${primaryMeterLabel})` : ''}`;
  } else {
    const latestPurchase = relevantPurchases.at(-1) || null;
    if (latestPurchase && latestPurchase.remainingUnits !== null) {
      availableUnits = latestPurchase.remainingUnits;
      availableUnitsSource = 'Recorded balance from latest token purchase';
    } else if (latestPurchase) {
      availableReason = 'The latest token purchase has no recorded remaining balance. Record a meter balance to make this precise.';
    } else {
      availableReason = 'Record a meter balance or a token purchase with units.';
    }
  }

  let dailyConsumption = null;
  let consumptionSource = '';
  let consumptionReason = '';
  let consumptionIntervals = 0;

  if (readingsForMeter.length < 2) {
    consumptionReason = 'Add at least two dated meter readings for the same meter.';
  } else {
    let totalConsumed = 0;
    let totalDays = 0;
    let inconsistentInterval = false;
    for (let index = 1; index < readingsForMeter.length; index += 1) {
      const previous = readingsForMeter[index - 1];
      const current = readingsForMeter[index];
      const elapsedDays = (current.date - previous.date) / DAY_MS;
      if (!(elapsedDays > 0)) continue;
      const purchasedBetween = relevantPurchases.reduce((sum, purchase) => (
        purchase.date > previous.date && purchase.date <= current.date ? sum + purchase.units : sum
      ), 0);
      const consumed = previous.units + purchasedBetween - current.units;
      if (consumed < 0) {
        warnings.push(`The meter balance rose from ${previous.units.toFixed(1)} kWh to ${current.units.toFixed(1)} kWh between ${shortDate(previous.date)} and ${shortDate(current.date)} without enough recorded purchases. Check the readings and token records.`);
        inconsistentInterval = true;
        continue;
      }
      totalConsumed += consumed;
      totalDays += elapsedDays;
      consumptionIntervals += 1;
    }
    if (inconsistentInterval) {
      consumptionReason = 'One or more meter reading intervals are inconsistent, so average daily use cannot be calculated.';
    } else if (consumptionIntervals > 0 && totalDays > 0) {
      dailyConsumption = totalConsumed / totalDays;
      consumptionSource = `Meter readings${primaryMeterLabel ? ` (${primaryMeterLabel})` : ''}`;
    } else {
      consumptionReason = 'The recorded meter readings are inconsistent, so average daily use cannot be calculated.';
    }
  }

  let remainingDays = null;
  let supplyReason = '';
  if (availableUnits === null) {
    supplyReason = availableReason || 'Available electricity is unknown.';
  } else if (dailyConsumption === null) {
    supplyReason = consumptionReason || 'Average daily use is unknown.';
  } else if (dailyConsumption <= 0) {
    supplyReason = 'Consumption is not yet measurable from the recorded readings.';
  } else {
    remainingDays = availableUnits / dailyConsumption;
  }

  const currentTime = validDate(now) || new Date();
  const exhaustionAt = remainingDays === null
    ? null
    : new Date(currentTime.getTime() + remainingDays * DAY_MS);
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
    availableReason,
    dailyConsumption,
    consumptionSource,
    consumptionReason,
    remainingDays,
    supplyReason,
    exhaustionAt,
    lastPurchaseAt: purchases.at(-1)?.date || null,
    purchaseCount: purchases.length,
    readingCount: readingsForMeter.length,
    lastReadingAt: latestReadingForMeter?.date || null,
    meterId: primaryMeterLabel || null,
    warnings,
    status
  };
}
