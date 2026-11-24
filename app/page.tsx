"use client"

import { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { signOut } from "next-auth/react"
import DeviceManager from "@/components/device-manager"
import WidgetManager from "@/components/widgets/widget-manager"
import { supabase } from "@/lib/supabase"
import DatabaseConnectionManager from "@/components/database-connection-manager"
import { setupMockFetch } from "@/lib/mock-fetch-middleware"
import type { Device } from "@/lib/supabase"

function ESP32Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [currentTab, setActiveTab] = useState<string>("widgets")
  const [connectedDeviceIds, setConnectedDeviceIds] = useState<Set<string>>(new Set())
  const [connectedDevices, setConnectedDevices] = useState<Map<string, Device>>(new Map())
  const initialLoadRef = useRef(true)
  const [devices, setDevices] = useState<Device[]>([])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (status === "authenticated" && initialLoadRef.current) {
      initialLoadRef.current = false
      try {
        const storedDevices = localStorage.getItem("connectedDevices")
        if (storedDevices) {
          const parsedDevices = JSON.parse(storedDevices)
          if (Array.isArray(parsedDevices) && parsedDevices.length > 0) {
            setConnectedDeviceIds(new Set(parsedDevices))
          }
        }
      } catch (error) {
        console.error("Error loading connected devices from localStorage:", error)
      }
    }
  }, [status])

  useEffect(() => {
    if (initialLoadRef.current) return
    if (connectedDeviceIds.size > 0) {
      const deviceArray = Array.from(connectedDeviceIds)
      localStorage.setItem("connectedDevices", JSON.stringify(deviceArray))
    } else {
      localStorage.removeItem("connectedDevices")
      setConnectedDevices(new Map())
    }
  }, [connectedDeviceIds])

  useEffect(() => {
    let cancelled = false

    const fetchConnectedDevices = async () => {
      if (!session?.user?.id || connectedDeviceIds.size === 0) {
        setConnectedDevices(new Map())
        return
      }

      try {
        const { data, error } = await supabase
          .from("devices")
          .select("*")
          .eq("user_id", session.user.id)
          .in("id", Array.from(connectedDeviceIds))
        if (error) throw error
        if (cancelled) return

        const connectedDeviceMap = new Map<string, Device>(data.map((device) => [device.id, device]))
        setConnectedDevices(connectedDeviceMap)
        const validDeviceIds = new Set(connectedDeviceMap.keys())
        setConnectedDeviceIds((currentIds) => {
          const validIds = new Set(Array.from(currentIds).filter((id) => validDeviceIds.has(id)))
          return validIds.size === currentIds.size ? currentIds : validIds
        })
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching connected devices:", error)
        }
      }
    }

    fetchConnectedDevices()

    return () => {
      cancelled = true
    }
  }, [connectedDeviceIds, session?.user?.id])

  useEffect(() => {
    if (typeof window === "undefined") return
    const cleanup = setupMockFetch()
    return () => cleanup?.()
  }, [])

  useEffect(() => {
    const fetchAllDevices = async () => {
      if (!session?.user?.id) return
      try {
        const { data, error } = await supabase.from("devices").select("*").eq("user_id", session.user.id)
        if (error) throw error
        setDevices(data)
      } catch (error) {
        console.error("Error fetching devices:", error)
      }
    }
    fetchAllDevices()
  }, [session?.user?.id])

  const handleDeviceConnect = (deviceId: string | null, action: "connect" | "disconnect") => {
    if (!deviceId) return
    const newConnectedIds = new Set(connectedDeviceIds)
    if (action === "connect") {
      newConnectedIds.add(deviceId)
      const dummyDevice = devices.find((d) => d.id === deviceId && d.ip_address === "192.168.1.200")
      if (dummyDevice) {
        setupMockFetch()
      }
    } else {
      newConnectedIds.delete(deviceId)
    }
    setConnectedDeviceIds(newConnectedIds)
  }

  if (status === "loading" || status === "unauthenticated") {
    return null
  }

  const esp32Devices = Array.from(connectedDevices.values())
    .filter((device): device is Device & { ip_address: string } => typeof device.ip_address === "string")
    .map((device) => device.ip_address)

  return (
    <div className="container mx-auto py-8 px-2 sm:px-4 overflow-x-hidden relative">
      <div className="absolute top-4 right-4 z-10 sm:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="h-8 px-2"
        >
          <LogOut className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-6">
        <h1 className="text-2xl font-bold">GreenhouseWebApp</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          {session?.user?.name && (
            <span className="text-sm text-muted-foreground">
              Signed in as {session.user.name}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full sm:w-auto hidden sm:flex"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="flex flex-row w-full gap-1">
          <TabsTrigger
            value="devices"
            className="flex-1 min-w-0 text-xs sm:text-sm"
          >
            Devices
          </TabsTrigger>
          <TabsTrigger
            value="widgets"
            className="flex-1 min-w-0 text-xs sm:text-sm"
          >
            Widgets
          </TabsTrigger>
          <TabsTrigger
            value="database"
            className="flex-1 min-w-0 text-xs sm:text-sm"
          >
            Database Connections
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devices">
          <DeviceManager
            onDeviceConnect={handleDeviceConnect}
            connectedDeviceIds={connectedDeviceIds}
          />
        </TabsContent>

        <TabsContent value="widgets">
          <WidgetManager connectedDeviceIds={connectedDeviceIds} />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseConnectionManager esp32Devices={esp32Devices} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default ESP32Dashboard