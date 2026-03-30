defmodule MyApp.Config do
  @moduledoc """
  Configuration module for the application.
  """

  defstruct [:name, value: 42, enabled: true]

  @type t :: %__MODULE__{
    name: String.t(),
    value: integer(),
    enabled: boolean()
  }

  def new(name, opts \\ []) do
    %__MODULE__{
      name: name,
      value: Keyword.get(opts, :value, 42),
      enabled: Keyword.get(opts, :enabled, true)
    }
  end
end

defmodule MyApp.DataProcessor do
  @moduledoc """
  Processes data files.
  """

  alias MyApp.Config
  require Logger

  @spec process(String.t()) :: {:ok, String.t()} | {:error, term()}
  def process(input) do
    case File.read(input) do
      {:ok, content} -> {:ok, String.upcase(content)}
      {:error, reason} -> {:error, reason}
    end
  end

  def get_status(%Config{enabled: true}), do: :active
  def get_status(%Config{enabled: false}), do: :inactive

  defp validate_input(input) do
    if String.length(input) > 0, do: :ok, else: :error
  end
end

defmodule MyApp.Cache do
  use GenServer

  @default_ttl 60_000

  def start_link(opts \\ []) do
    capacity = Keyword.get(opts, :capacity, 100)
    GenServer.start_link(__MODULE__, %{capacity: capacity}, name: __MODULE__)
  end

  def get(key) do
    GenServer.call(__MODULE__, {:get, key})
  end

  def put(key, value, opts \\ []) do
    ttl = Keyword.get(opts, :ttl, @default_ttl)
    GenServer.cast(__MODULE__, {:put, key, value, ttl})
  end

  def clear do
    GenServer.cast(__MODULE__, :clear)
  end

  @impl true
  def init(config) do
    {:ok, Map.merge(config, %{cache: %{}, hits: 0, misses: 0})}
  end

  @impl true
  def handle_call({:get, key}, _from, state) do
    case Map.get(state.cache, key) do
      nil ->
        {:reply, nil, %{state | misses: state.misses + 1}}

      %{value: value, expires_at: expires_at} ->
        if System.monotonic_time(:millisecond) > expires_at do
          new_cache = Map.delete(state.cache, key)
          {:reply, nil, %{state | cache: new_cache, misses: state.misses + 1}}
        else
          {:reply, value, %{state | hits: state.hits + 1}}
        end
    end
  end

  @impl true
  def handle_cast({:put, key, value, ttl}, state) do
    entry = %{
      value: value,
      expires_at: System.monotonic_time(:millisecond) + ttl
    }

    new_cache = Map.put(state.cache, key, entry)
    {:noreply, %{state | cache: new_cache}}
  end

  @impl true
  def handle_cast(:clear, state) do
    {:noreply, %{state | cache: %{}, hits: 0, misses: 0}}
  end
end

defmodule MyApp.EventBus do
  use GenServer

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def subscribe(event, handler) do
    GenServer.call(__MODULE__, {:subscribe, event, handler})
  end

  def publish(event, data \\ nil) do
    GenServer.cast(__MODULE__, {:publish, event, data})
  end

  @impl true
  def init(_opts) do
    {:ok, %{handlers: %{}}}
  end

  @impl true
  def handle_call({:subscribe, event, handler}, _from, state) do
    handlers = Map.update(state.handlers, event, [handler], &[handler | &1])
    {:reply, :ok, %{state | handlers: handlers}}
  end

  @impl true
  def handle_cast({:publish, event, data}, state) do
    case Map.get(state.handlers, event) do
      nil -> :ok
      handlers -> Enum.each(handlers, &(&1.(data)))
    end

    {:noreply, state}
  end
end
