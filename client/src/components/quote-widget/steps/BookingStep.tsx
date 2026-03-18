import { useEffect, useState } from 'react';
import { CalendarDays, Clock, Loader2, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWidgetState } from '../useWidgetState';
import type { StepDefinition } from '@shared/wizardSchema';

interface BookingStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Minimal booking step. Lets user pick a date, see available
 * time slots, fill in customer info, and confirm. Uses existing
 * widget state shape (booking.data, booking.availableSlots, etc.)
 * and the existing GET /api/bookings/availability endpoint.
 */
export default function BookingStep({ step, accentColor }: BookingStepProps) {
  const { config, state, dispatch } = useWidgetState();
  const booking = state.booking;
  const { selectedDate, selectedTime, customer } = booking.data;

  // Fetch available slots when date changes
  useEffect(() => {
    if (!selectedDate || !config.calculator.id) return;
    dispatch({ type: 'SET_LOADING_SLOTS', value: true });
    dispatch({ type: 'SET_BOOKING_TIME', time: '' });

    fetch(`/api/bookings/availability?calculator_id=${config.calculator.id}&date=${selectedDate}`)
      .then((r) => r.json())
      .then((data) => {
        dispatch({ type: 'SET_AVAILABLE_SLOTS', slots: data.slots || [] });
      })
      .catch(() => {
        dispatch({ type: 'SET_AVAILABLE_SLOTS', slots: [] });
      })
      .finally(() => {
        dispatch({ type: 'SET_LOADING_SLOTS', value: false });
      });
  }, [selectedDate, config.calculator.id, dispatch]);

  if (booking.confirmed) {
    return (
      <div className="space-y-3 text-center py-4">
        <CheckCircle2 className="h-10 w-10 mx-auto" style={{ color: accentColor || '#22c55e' }} />
        <h3 className="text-lg font-semibold">Booking Confirmed</h3>
        <p className="text-sm text-muted-foreground">
          {selectedDate} at {selectedTime}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step.title && <h3 className="text-lg font-semibold">{step.title}</h3>}
      {step.subtitle && <p className="text-sm text-muted-foreground">{step.subtitle}</p>}

      {/* Date picker */}
      <div className="space-y-1.5">
        <Label htmlFor="booking-date" className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" />
          Select a date
        </Label>
        <Input
          id="booking-date"
          type="date"
          value={selectedDate}
          min={new Date().toISOString().split('T')[0]}
          onChange={(e) => dispatch({ type: 'SET_BOOKING_DATE', date: e.target.value })}
        />
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Available times
          </Label>
          {booking.loadingSlots ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading slots...
            </div>
          ) : booking.availableSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No slots available for this date. Try another day.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {booking.availableSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => dispatch({ type: 'SET_BOOKING_TIME', time: slot })}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                    selectedTime === slot
                      ? 'border-current font-semibold shadow-sm'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                  style={selectedTime === slot && accentColor ? { borderColor: accentColor, color: accentColor } : undefined}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Customer info */}
      {selectedTime && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Your details</p>
          <div className="space-y-2">
            <Input
              placeholder="Name"
              value={customer.name}
              onChange={(e) => dispatch({ type: 'SET_BOOKING_CUSTOMER', field: 'name', value: e.target.value })}
            />
            <Input
              placeholder="Email"
              type="email"
              value={customer.email}
              onChange={(e) => dispatch({ type: 'SET_BOOKING_CUSTOMER', field: 'email', value: e.target.value })}
            />
            <Input
              placeholder="Phone"
              type="tel"
              value={customer.phone}
              onChange={(e) => dispatch({ type: 'SET_BOOKING_CUSTOMER', field: 'phone', value: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'CONFIRM_BOOKING' })}
            disabled={!customer.name.trim() || !customer.email.trim()}
            className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: accentColor ? `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)` : '#6366f1' }}
          >
            Confirm Booking
          </button>
        </div>
      )}
    </div>
  );
}
