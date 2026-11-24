"use client"

import { DialogTrigger } from "@/components/ui/dialog"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Droplets, Trash2, Clock, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Widget } from "@/lib/supabase"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { StorageService } from "@/lib/storage-service"
import type { SensorPayload, SensorReading } from "@/lib/device-api"

interface MoistureSensorWidgetProps {
  widget: Widget
  deviceIp: string | null
  onDelete: (id: string) => Promise<void>
}

export default function MoistureSensorWidget({ widget, deviceIp, onDelete }: MoistureSensorWidgetProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [moisture, setMoisture] = useState<number | null>(null) 
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null) 
  const [refreshInt, setRefreshInt] = useState((widget.configuration?.refresh_rate ?? 10) * 1000 || 10000)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tempInt, setTempInt] = useState(refreshInt / 1000) 
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const isRefreshing = useRef(false)
  const intRef = useRef<NodeJS.Timeout | null>(null) 

  const updateDeviceInt = async (seconds: number) => {
    if (!deviceIp) return false
    try {
      const ms = seconds * 1000

      const response = await fetch(`http://${deviceIp}/set-moisture-interval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: ms }),
      })
      if (!response.ok) throw new Error(`Failed to update interval: ${response.status}`)
      const data = await response.json()
      if (!data.success) throw new Error(data.error || "Failed to update interval")
      return true
    } catch (err: unknown) {
      console.error("Error updating device interval:", err)
      setErr(`Failed to update interval: ${err instanceof Error ? err.message : "Unknown error"}`)
      return false
    }
  }

  const getMoistureData = async () => {
    if (!deviceIp) {
      setErr("No device IP address available")
      return
    }
    if (!isRefreshing.current) setLoading(true)
    setErr(null)
    try {
      const ts = new Date().getTime() 
      const response = await fetch(`http://${deviceIp}/sensors?t=${ts}&pin=${widget.pin}`, { cache: "no-store" })
      if (!response.ok) throw new Error(`Failed to fetch sensor data: ${response.status}`)
      const data = (await response.json()) as SensorPayload | SensorReading[]

      let rawVal: number | null = null
      let pctVal: number | null = null

      if (Array.isArray(data)) {
        const moistSensor = data.find(
          (sensor) =>
            ["moisture", "soil_moisture", "soil"].includes(sensor.type ?? "") ||
            ["moisture", "soil_moisture"].includes(sensor.id ?? "") ||
            sensor.name?.toLowerCase().includes("moisture") ||
            sensor.name?.toLowerCase().includes("soil"),
        )
        if (moistSensor) {
          rawVal = moistSensor.value ?? null
          pctVal = moistSensor.percentage ?? null
        }
      } else if (data.sensors && Array.isArray(data.sensors)) {
        const moistSensor = data.sensors.find(
          (sensor) =>
            ["moisture", "soil_moisture", "soil"].includes(sensor.type ?? "") ||
            ["moisture", "soil_moisture"].includes(sensor.id ?? "") ||
            sensor.name?.toLowerCase().includes("moisture") ||
            sensor.name?.toLowerCase().includes("soil"),
        )
        if (moistSensor) {
          rawVal = moistSensor.value ?? null
          pctVal = moistSensor.percentage ?? null
        }
      } else if (typeof data.soil_moisture === "number") {
        rawVal = data.soil_moisture
      } else {
        for (const [key, value] of Object.entries(data)) {
          if (
            typeof value === "number" &&
            (key.includes("soil") ||
              key.includes("moisture") ||
              (value >= 0 && value <= 4095))
          ) {
            rawVal = value
            break
          }
        }
      }

      if (pctVal !== null && typeof pctVal === "number") {
        setMoisture(pctVal)
      } else if (rawVal !== null && typeof rawVal === "number") {

        const moistPct = Math.max(0, Math.min(100, 100 - (rawVal / 4095) * 100))
        setMoisture(moistPct)
      } else {
        setErr("Could not find valid moisture sensor data")
      }
    } catch (err: unknown) {
      console.error("Error fetching moisture data:", err)
      setErr(`Failed to read sensor: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      if (!isRefreshing.current) setLoading(false)
      isRefreshing.current = false
    }
  }

  const bgRefresh = () => {
    isRefreshing.current = true
    getMoistureData()
  }


  const saveSettings = async () => {
    setSavingSettings(true)
    setSettingsSaved(false)
    setErr(null)
    try {
      const ok = await updateDeviceInt(tempInt)
      if (!ok) throw new Error("Failed to update device interval")

      if (widget.id) {
        await StorageService.updateWidgetConfiguration(widget.id, {
          ...widget.configuration,
          refresh_rate: tempInt,
        })
      }
      setRefreshInt(tempInt * 1000)
  

      if (intRef.current) clearInterval(intRef.current)
      intRef.current = setInterval(bgRefresh, tempInt * 1000)

      setSettingsSaved(true)
      setTimeout(() => {
        setSettingsOpen(false)
        setSettingsSaved(false)
      }, 1500)
    } catch (err: unknown) {
      console.error("Error saving settings:", err)
      setErr(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setSavingSettings(false)
    }
  }

  useEffect(() => {
    if (deviceIp) {
      getMoistureData()
      intRef.current = setInterval(bgRefresh, refreshInt)
      return () => {
        if (intRef.current) clearInterval(intRef.current)
      }
    }
  }, [deviceIp, widget.pin, refreshInt])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(widget.id)
    } catch (error) {
      console.error("Error deleting widget:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  // Mitruma statusa noteikšana 
  const getMoistStatus = () => {
    if (moisture === null) return "Unknown"
    if (moisture < 30) return "Dry"
    if (moisture < 70) return "Moist"
    return "Wet"
  }

  
  const getMoistColor = () => {
    if (moisture === null) return "bg-gray-200"
    if (moisture < 30) return "bg-orange-500" 
    if (moisture < 70) return "bg-green-500" 
    return "bg-blue-500" 
  }


  const moistDisplay = moisture !== null ? `${Math.round(moisture)}%` : "N/A"
  const moistStatus = getMoistStatus()
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-500" />
            {widget.name}
          </CardTitle>
          <div className="flex gap-2">
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Moisture Sensor Settings</DialogTitle>
                  <DialogDescription>Configure the soil moisture sensor</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="refresh-rate">Refresh Rate</Label>
                      <span className="text-sm text-muted-foreground">{tempInt} seconds</span>
                    </div>
                    <Slider
                      id="refresh-rate"
                      min={1}
                      max={60}
                      step={1}
                      value={[tempInt]}
                      onValueChange={(value) => setTempInt(value[0])}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1s</span>
                      <span>30s</span>
                      <span>60s</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Updates every {tempInt} seconds</span>
                  </div>
                  {err && <div className="text-sm text-destructive">{err}</div>}
                  {settingsSaved && <div className="text-sm text-green-600 font-medium">Settings saved!</div>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveSettings} disabled={savingSettings}>
                    {savingSettings ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Badge>sensor</Badge>
          </div>
        </div>
        <CardDescription>Soil Moisture Sensor</CardDescription>
        {widget.pin !== null && <CardDescription>Pin: {widget.pin}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {loading ? (
            <div className="text-center text-sm text-muted-foreground">Loading...</div>
          ) : err ? (
            <div className="text-center text-sm text-destructive">{err}</div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Moisture Level:</span>
                <span className="text-sm" id="moisture-value">
                  {moistDisplay}
                </span>
              </div>
              <Progress value={moisture || 0} className={`h-2 ${getMoistColor()}`} />
              <div className="text-center text-sm font-medium" id="moisture-status">
                Status: {moistStatus}
              </div>
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Updates every {refreshInt / 1000} seconds</span>
                <Button variant="link" className="p-0 h-auto text-xs" onClick={() => setSettingsOpen(true)}>
                  Change
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-destructive"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {isDeleting ? "Removing..." : "Remove"}
        </Button>
      </CardFooter>
    </Card>
  )
}
