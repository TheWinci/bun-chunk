open Printf

type config = {
  name : string;
  value : int;
  enabled : bool;
}

type status =
  | Active
  | Inactive
  | Pending

let default_config name =
  { name; value = 42; enabled = true }

let process path =
  try
    let ic = open_in path in
    let n = in_channel_length ic in
    let content = really_input_string ic n in
    close_in ic;
    Some (String.uppercase_ascii content)
  with _ -> None

let helper x = x * 2

let create_processor name = default_config name

type 'a cache_entry = {
  key : string;
  entry_value : 'a;
  expires_at : float;
  tags : string list;
}

module StringMap = Map.Make(String)

type 'a lru_cache = {
  mutable entries : 'a cache_entry StringMap.t;
  mutable order : string list;
  capacity : int;
  default_ttl : float;
  mutable hits : int;
  mutable misses : int;
}

let new_cache capacity default_ttl = {
  entries = StringMap.empty;
  order = [];
  capacity;
  default_ttl;
  hits = 0;
  misses = 0;
}

let cache_get cache key =
  match StringMap.find_opt key cache.entries with
  | None ->
    cache.misses <- cache.misses + 1;
    None
  | Some entry ->
    if Unix.gettimeofday () > entry.expires_at then begin
      cache.entries <- StringMap.remove key cache.entries;
      cache.order <- List.filter (fun k -> k <> key) cache.order;
      cache.misses <- cache.misses + 1;
      None
    end else begin
      cache.hits <- cache.hits + 1;
      cache.order <- List.filter (fun k -> k <> key) cache.order @ [key];
      Some entry.entry_value
    end

let cache_put cache key value ?ttl ?(tags=[]) () =
  let ttl = match ttl with Some t -> t | None -> cache.default_ttl in
  if StringMap.mem key cache.entries then
    cache.entries <- StringMap.remove key cache.entries
  else if StringMap.cardinal cache.entries >= cache.capacity then
    match cache.order with
    | [] -> ()
    | oldest :: rest ->
      cache.entries <- StringMap.remove oldest cache.entries;
      cache.order <- rest;
  let entry = {
    key;
    entry_value = value;
    expires_at = Unix.gettimeofday () +. ttl;
    tags;
  } in
  cache.entries <- StringMap.add key entry cache.entries;
  cache.order <- cache.order @ [key]

let cache_clear cache =
  cache.entries <- StringMap.empty;
  cache.order <- [];
  cache.hits <- 0;
  cache.misses <- 0

let cache_stats cache =
  let total = cache.hits + cache.misses in
  let hit_rate =
    if total = 0 then 0.0
    else float_of_int cache.hits /. float_of_int total
  in
  (cache.hits, cache.misses, StringMap.cardinal cache.entries, hit_rate)

exception ProcessError of string

module EventBus : sig
  type t
  val create : unit -> t
  val subscribe : t -> string -> (string -> unit) -> unit
  val publish : t -> string -> string -> unit
end = struct
  type t = {
    mutable handlers : (string -> unit) list StringMap.t;
  }

  let create () = { handlers = StringMap.empty }

  let subscribe bus event handler =
    let existing =
      match StringMap.find_opt event bus.handlers with
      | None -> []
      | Some hs -> hs
    in
    bus.handlers <- StringMap.add event (handler :: existing) bus.handlers

  let publish bus event data =
    match StringMap.find_opt event bus.handlers with
    | None -> ()
    | Some handlers -> List.iter (fun h -> h data) handlers
end
