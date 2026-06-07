import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createJobSchema, type CreateJobInput } from "@shared/schema";
import { useCreateJob } from "@/hooks/use-jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, MapPin, LocateFixed, ImagePlus, X, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { z } from "zod";

const formSchema = createJobSchema.extend({
  price: z.coerce.number().min(100, "Minimum price is ₦100"),
  priceType: z.enum(["total", "per_person"]).default("total"),
  workersNeeded: z.coerce.number().min(1, "At least 1 worker required").max(50, "Maximum 50 workers"),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface UploadedImage {
  objectPath: string;
  previewUrl: string;
  name: string;
}

export function CreateJobDialog() {
  const [open, setOpen] = useState(false);
  const [jobLat, setJobLat] = useState<number | null>(null);
  const [jobLng, setJobLng] = useState<number | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const { toast } = useToast();
  const { mutate: createJob, isPending } = useCreateJob();
  const { uploadFile } = useUpload();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      price: undefined,
      priceType: "total" as const,
      location: "",
      category: "other",
      workersNeeded: 1,
      scheduledDate: "",
      scheduledTime: "",
    },
  });

  const watchedWorkersNeeded = form.watch("workersNeeded");
  const watchedPrice = form.watch("price");
  const watchedPriceType = form.watch("priceType");

  const totalEscrow = watchedPrice && watchedWorkersNeeded > 1 && watchedPriceType === "per_person"
    ? watchedPrice * watchedWorkersNeeded
    : watchedPrice || 0;

  const handleImageFiles = async (files: FileList | null) => {
    if (!files) return;
    const remaining = 5 - uploadedImages.length;
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) {
      toast({ title: "Max 5 photos", description: "You can upload up to 5 photos per job.", variant: "destructive" });
      return;
    }
    setUploadingCount(c => c + toUpload.length);
    for (const file of toUpload) {
      if (!file.type.startsWith('image/')) continue;
      const previewUrl = URL.createObjectURL(file);
      const result = await uploadFile(file);
      if (result) {
        setUploadedImages(prev => [...prev, { objectPath: result.objectPath, previewUrl, name: file.name }]);
      }
      setUploadingCount(c => c - 1);
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Not supported", description: "Your browser doesn't support location access.", variant: "destructive" });
      return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setJobLat(latitude);
        setJobLng(longitude);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const address = data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
          form.setValue("location", address, { shouldValidate: true });
          toast({ title: "Location captured", description: "Your live location has been set as the job address." });
        } catch {
          form.setValue("location", `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, { shouldValidate: true });
        } finally {
          setIsGettingLocation(false);
        }
      },
      (err) => {
        setIsGettingLocation(false);
        toast({ title: "Location denied", description: "Please allow location access or type the address manually.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onSubmit = (data: FormValues) => {
    let scheduledDate: string | undefined;
    if (data.scheduledDate) {
      const dateStr = data.scheduledDate;
      const timeStr = data.scheduledTime || "09:00";
      scheduledDate = new Date(`${dateStr}T${timeStr}`).toISOString();
    }
    const { scheduledTime: _st, ...rest } = data;
    createJob({
      ...rest,
      price: String(data.price),
      priceType: data.workersNeeded > 1 ? data.priceType : "total",
      workersNeeded: Number(data.workersNeeded),
      scheduledDate: scheduledDate || undefined,
      ...(jobLat !== null && jobLng !== null ? { latitude: String(jobLat), longitude: String(jobLng) } : {}),
      ...(uploadedImages.length > 0 ? { images: uploadedImages.map(img => img.objectPath) } : {}),
    } as unknown as CreateJobInput, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        setJobLat(null);
        setJobLng(null);
        uploadedImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
        setUploadedImages([]);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 rounded-xl font-semibold">
          <Plus className="mr-2 h-5 w-5" />
          Post a Job
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] rounded-2xl border-none shadow-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-2xl font-bold font-display text-primary">Post a New Job</DialogTitle>
          <DialogDescription>
            Describe what needs to be done. We'll hold the payment in escrow.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4 overflow-y-auto flex-1 pr-1">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground/80">Job Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Fix my AC unit" className="rounded-xl border-2 focus:border-primary/50" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground/80">Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl border-2 focus:border-primary/50">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cleaning">Cleaning</SelectItem>
                        <SelectItem value="ac_repair">AC Repair</SelectItem>
                        <SelectItem value="phone_repair">Phone Repair</SelectItem>
                        <SelectItem value="escort">Escort/Guide</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground/80">Price (₦)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="5000" className="rounded-xl border-2 focus:border-primary/50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="workersNeeded"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground/80">Workers Needed</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={50} placeholder="1" className="rounded-xl border-2 focus:border-primary/50" {...field} data-testid="input-workers-needed" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {Number(watchedWorkersNeeded) > 1 && (
                <FormField
                  control={form.control}
                  name="priceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold text-foreground/80">Price Is</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl border-2 focus:border-primary/50" data-testid="select-price-type">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="total">Total for all</SelectItem>
                          <SelectItem value="per_person">Per person</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {Number(watchedWorkersNeeded) > 1 && watchedPrice > 0 && (
              <div className="bg-muted/50 rounded-xl p-3 border border-border text-sm space-y-1" data-testid="section-price-summary">
                {watchedPriceType === "per_person" ? (
                  <>
                    <p className="text-muted-foreground">
                      Each worker earns: <span className="font-semibold text-foreground">{"\u20A6"}{Number(watchedPrice).toLocaleString()}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Total escrow held: <span className="font-semibold text-foreground">{"\u20A6"}{totalEscrow.toLocaleString()}</span> ({watchedWorkersNeeded} workers)
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      Total price: <span className="font-semibold text-foreground">{"\u20A6"}{Number(watchedPrice).toLocaleString()}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Each worker earns: <span className="font-semibold text-foreground">{"\u20A6"}{Math.round(Number(watchedPrice) / Number(watchedWorkersNeeded)).toLocaleString()}</span>
                    </p>
                  </>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between mb-1">
                    <FormLabel className="font-semibold text-foreground/80">Location</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-primary hover:text-primary/80 gap-1"
                      onClick={handleUseMyLocation}
                      disabled={isGettingLocation}
                      data-testid="button-use-my-location"
                    >
                      {isGettingLocation ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LocateFixed className="w-3.5 h-3.5" />
                      )}
                      {isGettingLocation ? "Getting location..." : "Use my location"}
                    </Button>
                  </div>
                  <FormControl>
                    <AddressAutocomplete
                      value={field.value}
                      onChange={(val) => {
                        field.onChange(val);
                        if (jobLat !== null) { setJobLat(null); setJobLng(null); }
                      }}
                      placeholder="Start typing an area in Lagos..."
                      className="rounded-xl border-2 focus:border-primary/50"
                    />
                  </FormControl>
                  {jobLat !== null && (
                    <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> Live location pinned — map will show job site
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground/80">Date Needed</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        className="rounded-xl border-2 focus:border-primary/50"
                        {...field}
                        data-testid="input-scheduled-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scheduledTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground/80">Time</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        className="rounded-xl border-2 focus:border-primary/50"
                        {...field}
                        data-testid="input-scheduled-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground/80">Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Provide details about the task..." 
                      className="rounded-xl border-2 focus:border-primary/50 resize-none h-32" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Photo Upload Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground/80 flex items-center gap-1.5">
                  <Camera className="w-4 h-4" />
                  Job Photos
                  <span className="text-muted-foreground font-normal">(optional, up to 5)</span>
                </label>
                {uploadedImages.length < 5 && (
                  <label className="cursor-pointer" data-testid="button-add-photos">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => handleImageFiles(e.target.files)}
                      disabled={uploadingCount > 0}
                    />
                    <span className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium border border-primary/30 rounded-lg px-2 py-1">
                      {uploadingCount > 0 ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                      ) : (
                        <><ImagePlus className="w-3.5 h-3.5" /> Add Photos</>
                      )}
                    </span>
                  </label>
                )}
              </div>

              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2" data-testid="section-image-previews">
                  {uploadedImages.map((img, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-border group">
                      <img
                        src={img.previewUrl}
                        alt={img.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-image-${i}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {uploadingCount > 0 && (
                    <div className="aspect-square rounded-xl border border-border/50 border-dashed bg-muted/30 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              {uploadedImages.length === 0 && uploadingCount === 0 && (
                <label className="cursor-pointer block">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => handleImageFiles(e.target.files)}
                  />
                  <div className="border-2 border-dashed border-border hover:border-primary/40 rounded-xl p-6 text-center transition-colors" data-testid="dropzone-images">
                    <ImagePlus className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to add photos showing what needs to be done</p>
                  </div>
                </label>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl text-lg font-bold bg-primary hover:bg-primary/90"
              disabled={isPending || uploadingCount > 0}
            >
              {isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {isPending ? "Creating Job..." : "Post Job & Hold Funds"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
