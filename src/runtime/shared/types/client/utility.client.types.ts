import type {ComputedRef, Ref, ShallowRef} from "vue";

export type PossiblyRef<T> = ComputedRef<T> | Ref<T> | ShallowRef<T> | T
