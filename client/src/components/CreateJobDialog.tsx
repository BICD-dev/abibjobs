import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createJobSchema, type CreateJobInput } from "@shared/schema";
import { useCreateJob } from "@/hooks/use-jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Plus } from "lucide-react";
import { z } from "zod";

const formSchema = createJobSchema.extend({
  price: z.coerce.number().min(100, "Minimum price is ₦100"),
  workersNeeded: z.coerce.number().min(1, "At least 1 worker required").max(50, "Maximum 50 workers"),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateJobDialog() {
  const [open, setOpen] = useState(false);
  const { mutate: createJob, isPending } = useCreateJob();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      price: undefined,
      location: "",
      category: "other",
      workersNeeded: 1,
    },
  });

  const onSubmit = (data: FormValues) => {
    // Convert back to format API expects (number -> string/number as defined by schema)
    // The shared schema expects number or numeric string. 
    // Drizzle-zod schema for numeric columns usually expects string or number.
    createJob(data as unknown as CreateJobInput, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
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
      <DialogContent className="sm:max-w-[500px] rounded-2xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold font-display text-primary">Post a New Job</DialogTitle>
          <DialogDescription>
            Describe what needs to be done. We'll hold the payment in escrow.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
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

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground/80">Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Lagos, Ikeja" className="rounded-xl border-2 focus:border-primary/50" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl text-lg font-bold bg-primary hover:bg-primary/90"
              disabled={isPending}
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
