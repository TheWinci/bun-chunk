module MyApp.DataProcessor
  ( Config(..)
  , Status(..)
  , process
  , helper
  , createProcessor
  , CacheEntry(..)
  , LRUCache
  , newCache
  , cacheGet
  , cachePut
  ) where

import Data.Map.Strict (Map)
import qualified Data.Map.Strict as Map
import Data.Maybe (fromMaybe)
import Data.IORef
import System.IO (hPutStrLn, stderr)

data Config = Config
  { configName    :: String
  , configValue   :: Int
  , configEnabled :: Bool
  } deriving (Show, Eq)

defaultConfig :: String -> Config
defaultConfig name = Config
  { configName    = name
  , configValue   = 42
  , configEnabled = True
  }

data Status = Active | Inactive | Pending
  deriving (Show, Eq, Enum)

process :: FilePath -> IO (Maybe String)
process path = do
  result <- tryReadFile path
  case result of
    Left _    -> return Nothing
    Right content -> return (Just (map toUpper content))
  where
    toUpper c
      | c >= 'a' && c <= 'z' = toEnum (fromEnum c - 32)
      | otherwise             = c
    tryReadFile p = do
      content <- readFile p
      return (Right content)
      `catch` \(_ :: IOError) -> return (Left ())

helper :: Int -> Int
helper x = x * 2

createProcessor :: String -> Config
createProcessor = defaultConfig

data CacheEntry a = CacheEntry
  { entryKey       :: String
  , entryValue     :: a
  , entryExpiresAt :: Int
  , entryTags      :: [String]
  } deriving (Show)

data LRUCache a = LRUCache
  { cacheEntries :: IORef (Map String (CacheEntry a))
  , cacheOrder   :: IORef [String]
  , cacheCapacity :: Int
  , cacheDefaultTTL :: Int
  , cacheHits    :: IORef Int
  , cacheMisses  :: IORef Int
  }

newCache :: Int -> Int -> IO (LRUCache a)
newCache capacity defaultTTL = do
  entries <- newIORef Map.empty
  order   <- newIORef []
  hits    <- newIORef 0
  misses  <- newIORef 0
  return LRUCache
    { cacheEntries    = entries
    , cacheOrder      = order
    , cacheCapacity   = capacity
    , cacheDefaultTTL = defaultTTL
    , cacheHits       = hits
    , cacheMisses     = misses
    }

cacheGet :: LRUCache a -> String -> IO (Maybe a)
cacheGet cache key = do
  entries <- readIORef (cacheEntries cache)
  case Map.lookup key entries of
    Nothing -> do
      modifyIORef' (cacheMisses cache) (+ 1)
      return Nothing
    Just entry -> do
      modifyIORef' (cacheHits cache) (+ 1)
      return (Just (entryValue entry))

cachePut :: LRUCache a -> String -> a -> IO ()
cachePut cache key value = do
  entries <- readIORef (cacheEntries cache)
  order   <- readIORef (cacheOrder cache)

  let newEntry = CacheEntry
        { entryKey       = key
        , entryValue     = value
        , entryExpiresAt = 0
        , entryTags      = []
        }

  when (Map.size entries >= cacheCapacity cache) $ do
    case order of
      []    -> return ()
      (oldest:rest) -> do
        modifyIORef' (cacheEntries cache) (Map.delete oldest)
        writeIORef (cacheOrder cache) rest

  modifyIORef' (cacheEntries cache) (Map.insert key newEntry)
  modifyIORef' (cacheOrder cache) (++ [key])

cacheStats :: LRUCache a -> IO (Int, Int, Int, Double)
cacheStats cache = do
  hits   <- readIORef (cacheHits cache)
  misses <- readIORef (cacheMisses cache)
  entries <- readIORef (cacheEntries cache)
  let total = hits + misses
      rate  = if total == 0 then 0.0 else fromIntegral hits / fromIntegral total
  return (hits, misses, Map.size entries, rate)

cacheClear :: LRUCache a -> IO ()
cacheClear cache = do
  writeIORef (cacheEntries cache) Map.empty
  writeIORef (cacheOrder cache) []
  writeIORef (cacheHits cache) 0
  writeIORef (cacheMisses cache) 0
