export interface SensorReading {
  id?: string
  type?: string
  name?: string
  value?: number
  percentage?: number
}

export interface SensorPayload extends SensorReading {
  sensors?: SensorReading[]
  light?: number
  soil_moisture?: number
  [key: string]: unknown
}
