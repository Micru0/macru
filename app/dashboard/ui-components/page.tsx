"use client";

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Calendar } from "@/components/ui/calendar"
import { Progress } from "@/components/ui/Progress"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { InfoIcon, AlertCircle, Check, CalendarIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { useState } from "react"

export default function UIComponentsPage() {
  const [date, setDate] = useState<Date>()
  
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold mb-2">UI Components</h1>
        <p className="text-muted-foreground">A showcase of the UI components available in this project.</p>
      </div>
      
      <Tabs defaultValue="buttons" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="buttons">Buttons</TabsTrigger>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="data">Data Display</TabsTrigger>
          <TabsTrigger value="layout">Layout</TabsTrigger>
        </TabsList>
        
        <TabsContent value="buttons" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Buttons</CardTitle>
              <CardDescription>Various button styles and states.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Variants</h3>
                <div className="flex flex-wrap gap-4">
                  <Button>Default</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="link">Link</Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Sizes</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <Button size="lg">Large</Button>
                  <Button>Default</Button>
                  <Button size="sm">Small</Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">States</h3>
                <div className="flex flex-wrap gap-4">
                  <Button disabled>Disabled</Button>
                  <Button variant="outline" disabled>Disabled Outline</Button>
                  <Button className="w-32">
                    <svg className="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Loading
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">With Icons</h3>
                <div className="flex flex-wrap gap-4">
                  <Button>
                    <Check className="mr-2 h-4 w-4" /> Save
                  </Button>
                  <Button variant="outline">
                    <CalendarIcon className="mr-2 h-4 w-4" /> Calendar
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Toggle</h3>
                <div className="flex flex-wrap gap-4">
                  <Toggle>Toggle</Toggle>
                  <Toggle pressed>Pressed</Toggle>
                  <Toggle disabled>Disabled</Toggle>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="inputs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Input Controls</CardTitle>
              <CardDescription>Form input elements and controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Text Input</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="default-input">Default</Label>
                    <Input id="default-input" placeholder="Enter text..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="disabled-input">Disabled</Label>
                    <Input id="disabled-input" placeholder="Disabled input" disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="with-icon" className="flex items-center gap-2">
                      <InfoIcon className="h-4 w-4" /> With Label Icon
                    </Label>
                    <Input id="with-icon" placeholder="Input with icon label" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="with-error">With Error</Label>
                    <Input id="with-error" placeholder="Invalid input" className="border-red-500" />
                    <p className="text-sm text-red-500">This field is required</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Select</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="select">Basic Select</Label>
                    <Select>
                      <SelectTrigger id="select">
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="option1">Option 1</SelectItem>
                        <SelectItem value="option2">Option 2</SelectItem>
                        <SelectItem value="option3">Option 3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="disabled-select">Disabled Select</Label>
                    <Select disabled>
                      <SelectTrigger id="disabled-select">
                        <SelectValue placeholder="Disabled" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="option1">Option 1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Checkbox and Radio</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="terms" />
                      <Label htmlFor="terms">Accept terms and conditions</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="disabled-checkbox" disabled />
                      <Label htmlFor="disabled-checkbox" className="text-muted-foreground">Disabled checkbox</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Subscription Plan</Label>
                    <RadioGroup defaultValue="monthly">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="monthly" id="monthly" />
                        <Label htmlFor="monthly">Monthly</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yearly" id="yearly" />
                        <Label htmlFor="yearly">Yearly</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="lifetime" id="lifetime" disabled />
                        <Label htmlFor="lifetime" className="text-muted-foreground">Lifetime (Unavailable)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Switch and Slider</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="airplane-mode">Airplane Mode</Label>
                      <Switch id="airplane-mode" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="disabled-switch" className="text-muted-foreground">Disabled Switch</Label>
                      <Switch id="disabled-switch" disabled />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="volume">Volume</Label>
                        <span className="text-sm text-muted-foreground">75%</span>
                      </div>
                      <Slider id="volume" defaultValue={[75]} max={100} step={1} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="disabled-slider" className="text-muted-foreground">Disabled Slider</Label>
                      <Slider id="disabled-slider" defaultValue={[50]} max={100} step={1} disabled />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Date Picker</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Select a date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                          id="date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={setDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="feedback" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feedback Components</CardTitle>
              <CardDescription>Alerts, progress indicators, and other feedback elements.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Alerts</h3>
                <div className="space-y-4">
                  <Alert>
                    <InfoIcon className="h-4 w-4" />
                    <AlertTitle>Information</AlertTitle>
                    <AlertDescription>This is an informational alert with useful details.</AlertDescription>
                  </Alert>
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>Something went wrong. Please try again later.</AlertDescription>
                  </Alert>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Progress</h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>File upload</span>
                      <span>75%</span>
                    </div>
                    <Progress value={75} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Processing</span>
                      <span>25%</span>
                    </div>
                    <Progress value={25} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Completed</span>
                      <span>100%</span>
                    </div>
                    <Progress value={100} />
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Badges</h3>
                <div className="flex flex-wrap gap-4">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Data Display Components</CardTitle>
              <CardDescription>Components for showing data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Cards</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Simple Card</CardTitle>
                      <CardDescription>Basic card example</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p>Card content goes here</p>
                    </CardContent>
                    <CardFooter>
                      <Button size="sm">Action</Button>
                    </CardFooter>
                  </Card>
                  
                  <Card>
                    <CardHeader className="bg-muted/50">
                      <CardTitle>Header Styled</CardTitle>
                      <CardDescription>With styled header</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <p>Card content with styled header</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-primary">
                    <CardHeader>
                      <CardTitle>Accent Border</CardTitle>
                      <CardDescription>Special card with accent</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p>Card content with primary border</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Data Snippets</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {["Users", "Revenue", "Projects", "Tasks"].map((title, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <CardDescription>{title}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {title === "Revenue" ? "$12,543" : ["248", "16", "34"][i] || "87"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {i % 2 === 0 ? "+12% from last month" : "-4% from last month"}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="layout" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Layout Components</CardTitle>
              <CardDescription>Structural and layout elements.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Separators</h3>
                <div className="space-y-6">
                  <div>
                    <p>Content above the separator</p>
                    <Separator className="my-4" />
                    <p>Content below the separator</p>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div>Left</div>
                    <Separator orientation="vertical" className="h-5" />
                    <div>Middle</div>
                    <Separator orientation="vertical" className="h-5" />
                    <div>Right</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Tabs</h3>
                <div className="space-y-4">
                  <Tabs defaultValue="account" className="w-full max-w-md">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="account">Account</TabsTrigger>
                      <TabsTrigger value="password">Password</TabsTrigger>
                    </TabsList>
                    <TabsContent value="account" className="p-4 border rounded-md mt-2">
                      Account content would go here
                    </TabsContent>
                    <TabsContent value="password" className="p-4 border rounded-md mt-2">
                      Password content would go here
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Popover</h3>
                <div className="space-y-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline">Open Popover</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-2">
                        <h4 className="font-medium">Popover Content</h4>
                        <p className="text-sm text-muted-foreground">
                          Popovers can contain any content, including forms, buttons, or plain text.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 