declare module 'handlebars' {
  export interface CompileOptions {
    noEscape?: boolean
    strict?: boolean
  }

  export interface TemplateDelegate<TContext extends object = object, TResult = string> {
    (context: TContext): TResult
  }

  export interface HandlebarsRuntime {
    registerPartial(name: string, partial: string): void
    compile<TContext extends object = object>(
      template: string,
      options?: CompileOptions
    ): TemplateDelegate<TContext, string>
  }

  const Handlebars: HandlebarsRuntime
  export default Handlebars
}
declare module 'technicalindicators' {
  export interface PeriodValuesInput {
    period: number
    values: number[]
  }

  export interface HighLowClosePeriodInput {
    high: number[]
    low: number[]
    close: number[]
    period: number
  }

  export interface NumericSeriesCalculator<TInput> {
    calculate(input: TInput): number[]
  }

  export interface AdxPoint {
    adx?: number
  }

  export interface AdxCalculator {
    calculate(input: HighLowClosePeriodInput): AdxPoint[]
  }

  export interface MacdInput {
    values: number[]
    fastPeriod: number
    slowPeriod: number
    signalPeriod: number
    SimpleMAOscillator: boolean
    SimpleMASignal: boolean
  }

  export interface MacdPoint {
    MACD?: number
    signal?: number
    histogram?: number
  }

  export interface MacdCalculator {
    calculate(input: MacdInput): MacdPoint[]
  }

  export interface StochasticInput {
    high: number[]
    low: number[]
    close: number[]
    period: number
    signalPeriod: number
  }

  export interface StochasticPoint {
    k?: number
    d?: number
  }

  export interface StochasticCalculator {
    calculate(input: StochasticInput): StochasticPoint[]
  }

  export interface PsarInput {
    high: number[]
    low: number[]
    step: number
    max: number
  }

  export interface IchimokuCloudInput {
    high: number[]
    low: number[]
    conversionPeriod: number
    basePeriod: number
    spanPeriod: number
    displacement: number
  }

  export interface IchimokuCloudPoint {
    conversion?: number
    base?: number
    spanA?: number
    spanB?: number
  }

  export interface BandsInput {
    period: number
    values: number[]
    stdDev: number
  }

  export interface ChannelPoint {
    upper?: number
    middle?: number
    lower?: number
  }

  export interface BollingerCalculator {
    calculate(input: BandsInput): ChannelPoint[]
  }

  export interface KeltnerInput {
    high: number[]
    low: number[]
    close: number[]
    maPeriod: number
    atrPeriod: number
    useSMA: boolean
    multiplier: number
  }

  export interface KeltnerCalculator {
    calculate(input: KeltnerInput): ChannelPoint[]
  }

  export interface ObvInput {
    close: number[]
    volume: number[]
  }

  export interface MfiInput {
    high: number[]
    low: number[]
    close: number[]
    volume: number[]
    period: number
  }

  export const SMA: NumericSeriesCalculator<PeriodValuesInput>
  export const RSI: NumericSeriesCalculator<PeriodValuesInput>
  export const EMA: NumericSeriesCalculator<PeriodValuesInput>
  export const ROC: NumericSeriesCalculator<PeriodValuesInput>
  export const ATR: NumericSeriesCalculator<HighLowClosePeriodInput>
  export const ADX: AdxCalculator
  export const MACD: MacdCalculator
  export const Stochastic: StochasticCalculator
  export const PSAR: NumericSeriesCalculator<PsarInput>
  export const BollingerBands: BollingerCalculator
  export const KeltnerChannels: KeltnerCalculator
  export const OBV: NumericSeriesCalculator<ObvInput>
  export const MFI: NumericSeriesCalculator<MfiInput>

  export function ichimokucloud(input: IchimokuCloudInput): IchimokuCloudPoint[]
}
